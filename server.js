import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { projectListPage, projectPage } from './views.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function renderProjects(filter, error = '') {
  return projectListPage(listProjects.all(filter === 'Archived' ? 1 : 0), error, filter);
}

function renderProject(project, filter, errors = {}) {
  const tasks = listTasks.all(project.id).filter((task) => (
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed')
  ));
  return projectPage(project, tasks, filter, errors);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function send(response, status, content, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(content);
}

async function readForm(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16384) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    const projectRoute = pathname.match(/^\/projects\/(?<projectId>[1-9]\d*)(?:\/tasks(?:\/(?<taskId>[1-9]\d*)(?:\/(?<taskAction>rename))?)?|\/(?<projectAction>archive|restore|rename))?$/);
    if (request.method === 'GET' && pathname === '/health') {
      send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (request.method === 'GET' && pathname === '/') {
      send(response, 200, renderProjects(projectFilter(searchParams.get('filter'))));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      const filter = projectFilter(form.get('filter'));
      if (!name) {
        send(response, 400, renderProjects(filter, 'Project name is required'));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
    } else if (projectRoute) {
      const { projectId, taskId: taskIdValue, taskAction, projectAction } = projectRoute.groups;
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        send(response, 404, 'Project not found', 'text/plain; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && pathname === `/projects/${id}`) {
        send(response, 200, renderProject(project, taskFilter(searchParams.get('filter'))));
      } else if (request.method === 'POST' && projectAction === 'rename') {
        if (project.archived) {
          send(response, 403, 'Archived project', 'text/plain; charset=utf-8');
          return;
        }
        const form = await readForm(request);
        const name = (form.get('name') || '').trim();
        const filter = taskFilter(form.get('filter'));
        if (!name) {
          send(response, 400, renderProject(project, filter, { projectRename: 'Project name is required' }));
          return;
        }
        renameProject.run(name, id);
        redirect(response, `/projects/${id}?filter=${filter}`);
      } else if (request.method === 'POST' && projectAction) {
        const archive = projectAction === 'archive';
        setProjectArchived.run(archive ? 1 : 0, id);
        redirect(response, archive ? '/' : '/?filter=Archived');
      } else if (request.method === 'POST' && pathname.includes('/tasks')) {
        if (project.archived) {
          send(response, 403, 'Archived project', 'text/plain; charset=utf-8');
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (taskIdValue) {
          const taskId = Number(taskIdValue);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, id)) {
            send(response, 404, 'Task not found', 'text/plain; charset=utf-8');
            return;
          }
          if (taskAction === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              send(response, 400, renderProject(project, filter, {
                taskRename: { id: taskId, message: 'Task title is required' },
              }));
              return;
            }
            renameTask.run(title, taskId, id);
          } else {
            updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id);
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            send(response, 400, renderProject(project, filter, { taskCreation: 'Task title is required' }));
            return;
          }
          insertTask.run(id, title);
        }
        redirect(response, `/projects/${id}?filter=${filter}`);
      } else {
        send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      }
    } else {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      send(response, error.status || 500, error.status ? error.message : 'Internal server error', 'text/plain; charset=utf-8');
    } else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      database.close();
    });
  });
}
