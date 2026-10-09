import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { projectPage, projectsPage, errorPage } from './views.js';

const projectScript = readFileSync(new URL('./project.js', import.meta.url));
const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
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
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare(`
  SELECT id, title, completed FROM tasks
  WHERE project_id = ?
  ORDER BY id
`);
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function renderProject(project, filter, error = '') {
  return projectPage(project, listTasks.all(project.id), filter, error);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
    const error = new Error('Submit a URL-encoded form.');
    error.status = 415;
    throw error;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Form is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/project.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(projectScript);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage(listProjects.all()));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage(listProjects.all(), 'Project name is required'));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
      return;
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*))?)?$/.exec(url.pathname);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project && request.method === 'GET' && url.pathname === `/projects/${id}`) {
        sendHtml(response, 200, renderProject(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      if (project && request.method === 'POST' && url.pathname.startsWith(`/projects/${id}/tasks`)) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (match[2]) {
          const taskId = Number(match[2]);
          const completed = form.get('completed');
          if (completed !== null && completed !== '1') {
            sendHtml(response, 400, errorPage('Invalid completion state'));
            return;
          }
          if (!Number.isSafeInteger(taskId) || !updateTask.run(Number(completed === '1'), id, taskId).changes) {
            sendHtml(response, 404, errorPage('Task not found'));
            return;
          }
          if (request.headers.accept === 'application/json') {
            response.writeHead(204);
            response.end();
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, renderProject(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(id, title);
        }
        redirect(response, `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}`);
        return;
      }
    }
    sendHtml(response, 404, errorPage('Page not found'));
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, errorPage(error.status ? error.message : 'Something went wrong'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
