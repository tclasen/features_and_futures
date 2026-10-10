import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderProjects, renderProject } from './views.js';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
// Upgrade databases created before archive support without changing existing IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive the same default priority as new tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
         COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC
`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function projectFilter(url) {
  return url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(filter, error = '') {
  return renderProjects(listProjects.all(filter === 'Archived' ? 1 : 0), error, filter);
}

function taskFilter(url) {
  const value = url.searchParams.get('filter');
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(url) {
  const value = url.searchParams.get('priorityFilter');
  return ['Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function taskQuery(url) {
  const priority = priorityFilter(url);
  return `filter=${taskFilter(url)}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
}

function projectPage(project, url, error = '', renameError = '', taskRenameError = null) {
  const filter = taskFilter(url);
  const priority = priorityFilter(url);
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return renderProject(project, tasks, filter, error, renameError, taskRenameError, priority);
}

async function formData(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024 * 1024) {
      throw Object.assign(new Error('Request too large'), { status: 413 });
    }
  }
  return new URLSearchParams(body);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectsPage(projectFilter(url)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const name = ((await formData(req)).get('name') || '').trim();
      if (!name) {
        html(res, 400, projectsPage(projectFilter(url), 'Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(url.pathname);
    if (req.method === 'POST' && archiveMatch) {
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        res.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
        res.end();
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(res, 200, projectPage(project, url));
        return;
      }
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(url.pathname);
    if (req.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, url, '', 'Archived project is read-only'));
          return;
        }
        const name = ((await formData(req)).get('name') || '').trim();
        if (!name) {
          html(res, 400, projectPage(project, url, '', 'Project name is required'));
          return;
        }
        renameProject.run(name, project.id);
        res.writeHead(303, { Location: `/projects/${project.id}?${taskQuery(url)}` });
        res.end();
        return;
      }
    }
    const priorityMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/priority$/.exec(url.pathname);
    if (req.method === 'POST' && priorityMatch) {
      const project = findProject.get(priorityMatch[1]);
      const task = project && findTask.get(priorityMatch[2], project.id);
      if (task) {
        if (project.archived) {
          html(res, 403, projectPage(project, url, 'Archived project is read-only'));
          return;
        }
        const priority = (await formData(req)).get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          html(res, 400, projectPage(project, url, 'Invalid task priority'));
          return;
        }
        updatePriority.run(priority, task.id, project.id);
        res.writeHead(303, { Location: `/projects/${project.id}?${taskQuery(url)}` });
        res.end();
        return;
      }
    }
    const taskRenameMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/rename$/.exec(url.pathname);
    if (req.method === 'POST' && taskRenameMatch) {
      const project = findProject.get(taskRenameMatch[1]);
      const task = project && findTask.get(taskRenameMatch[2], project.id);
      if (task) {
        if (project.archived) {
          html(res, 403, projectPage(project, url, 'Archived project is read-only'));
          return;
        }
        const title = ((await formData(req)).get('title') || '').trim();
        if (!title) {
          html(res, 400, projectPage(project, url, '', '', { id: task.id, message: 'Task title is required' }));
          return;
        }
        renameTask.run(title, task.id, project.id);
        res.writeHead(303, { Location: `/projects/${project.id}?${taskQuery(url)}` });
        res.end();
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/.exec(url.pathname);
    if (req.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, url, 'Archived project is read-only'));
          return;
        }
        const data = await formData(req);
        if (taskMatch[2]) {
          const result = updateTask.run(data.get('completed') === 'on' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(res, 404, '<h1>Task not found</h1>');
            return;
          }
        } else {
          const title = (data.get('title') || '').trim();
          if (!title) {
            html(res, 400, projectPage(project, url, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        }
        res.writeHead(303, { Location: `/projects/${project.id}?${taskQuery(url)}` });
        res.end();
        return;
      }
    }
    html(res, 404, '<h1>Page not found</h1><a href="/">Projects</a>');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, error.status || 500, error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>');
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
