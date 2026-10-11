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
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function renderProject(project, filter, error = '') {
  const tasks = listTasks.all(project.id).filter((task) => (
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed')
  ));
  return projectPage(project, tasks, filter, error);
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
    const projectRoute = pathname.match(/^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*))?)?$/);
    if (request.method === 'GET' && pathname === '/health') {
      send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (request.method === 'GET' && pathname === '/') {
      send(response, 200, projectListPage(listProjects.all()));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        send(response, 400, projectListPage(listProjects.all(), 'Project name is required'));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
    } else if (projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        send(response, 404, 'Project not found', 'text/plain; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && pathname === `/projects/${id}`) {
        send(response, 200, renderProject(project, taskFilter(searchParams.get('filter'))));
      } else if (request.method === 'POST' && pathname.includes('/tasks')) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (projectRoute[2]) {
          const taskId = Number(projectRoute[2]);
          if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id).changes) {
            send(response, 404, 'Task not found', 'text/plain; charset=utf-8');
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            send(response, 400, renderProject(project, filter, 'Task title is required'));
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
