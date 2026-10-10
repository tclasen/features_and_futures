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
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
         COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC
`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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

function projectPage(project, filter, error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return renderProject(project, tasks, filter, error);
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
        html(res, 200, projectPage(project, taskFilter(url)));
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/.exec(url.pathname);
    if (req.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, taskFilter(url), 'Archived project is read-only'));
          return;
        }
        const data = await formData(req);
        const filter = taskFilter(url);
        if (taskMatch[2]) {
          const result = updateTask.run(data.get('completed') === 'on' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(res, 404, '<h1>Task not found</h1>');
            return;
          }
        } else {
          const title = (data.get('title') || '').trim();
          if (!title) {
            html(res, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        }
        res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
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
