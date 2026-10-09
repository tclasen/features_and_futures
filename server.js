import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderProjects, renderProject, renderNotFound } from './views.js';

const projectControls = readFileSync(new URL('./project-controls.js', import.meta.url));
const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY position');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');

const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY position');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title) VALUES (?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['open', 'completed'].includes(value) ? value : 'all';
}

function projectPage(project, filter, error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'all' || Boolean(task.completed) === (filter === 'completed'));
  return renderProject(project, tasks, filter, error);
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
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Form is too large');
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
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/project-controls.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(projectControls);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, renderProjects(listProjects.all()));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, renderProjects(listProjects.all(), 'Project name is required'));
        return;
      }
      insertProject.run(randomUUID(), name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([a-zA-Z0-9-]+)(?:\/tasks(?:\/([a-zA-Z0-9-]+))?)?$/.exec(url.pathname);
    if (match) {
      const project = findProject.get(match[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const projectPath = `/projects/${project.id}`;
      if (request.method === 'GET' && url.pathname === projectPath) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      if (request.method === 'POST' && url.pathname !== projectPath) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (match[2]) {
          const completed = form.get('completed') === 'on';
          const result = updateTask.run(completed ? 1 : 0, match[2], project.id);
          if (!result.changes) {
            sendHtml(response, 404, renderNotFound());
            return;
          }
          if (request.headers.accept === 'application/json') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ completed }));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(randomUUID(), project.id, title);
        }
        redirect(response, `${projectPath}?filter=${filter}`);
        return;
      }
    }
    sendHtml(response, 404, renderNotFound());
  } catch (error) {
    console.error(error);
    response.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.status === 413 ? 'Form is too large' : 'Internal server error');
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
