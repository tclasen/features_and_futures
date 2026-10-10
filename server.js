import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body;
    try {
      body = await readRequestBody(request);
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
      return;
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = createProject.run(name);
    sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    return;
  }

  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!Number.isSafeInteger(projectId) || !getProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET' && !taskRoute[2]) {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST' && !taskRoute[2]) {
      let body;
      try { body = await readRequestBody(request); } catch {
        sendJson(response, 400, { error: 'Invalid request body' });
        return;
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const result = createTask.run(projectId, title);
      sendJson(response, 201, getTask.get(Number(result.lastInsertRowid), projectId));
      return;
    }
    if (request.method === 'PATCH' && taskRoute[2]) {
      let body;
      try { body = await readRequestBody(request); } catch {
        sendJson(response, 400, { error: 'Invalid request body' });
        return;
      }
      const taskId = Number(taskRoute[2]);
      if (typeof body?.completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion state is required' });
        return;
      }
      if (!getTask.get(taskId, projectId)) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      sendJson(response, 200, getTask.get(taskId, projectId));
      return;
    }
  }

  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    const id = Number(url.pathname.slice('/projects/'.length));
    if (Number.isSafeInteger(id) && id > 0 && getProject.get(id)) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(await readFile(join(root, 'index.html')));
      return;
    }
  }

  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(root, 'index.html')));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(await readFile(join(root, 'app.js')));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/style.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    response.end(await readFile(join(root, 'style.css')));
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
