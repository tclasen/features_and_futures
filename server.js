import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderProjects, renderProject, renderNotFound } from './views.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['all', 'open', 'completed'].includes(value) ? value : 'all';
}

function projectPage(project, filter, error = '') {
  const tasks = listTasks.all(project.id).filter((task) => (
    filter === 'all' || Boolean(task.completed) === (filter === 'completed')
  ));
  return renderProject(project, tasks, filter, error);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && path === '/') {
      sendHtml(response, 200, renderProjects(listProjects.all()));
    } else if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, renderProjects(listProjects.all(), 'Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      sendHtml(response, project ? 200 : 404, project ? projectPage(project, taskFilter(url.searchParams.get('filter'))) : renderNotFound());
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*)?$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const task = Number(taskId);
        if (!Number.isSafeInteger(task) || updateTask.run(form.get('completed') === 'on' ? 1 : 0, task, id).changes === 0) {
          sendHtml(response, 404, renderNotFound());
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(id, title);
      }
      response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, renderNotFound());
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end(error.status === 413 ? 'Request body is too large' : 'Internal server error');
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
