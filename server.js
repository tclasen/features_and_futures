import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readBody(request);
      const cleanName = typeof name === 'string' ? name.trim() : '';
      if (!cleanName) return sendJson(response, 400, { error: 'Project name is required' });
      const result = createProject.run(cleanName);
      return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (request.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId));
  }
  if (request.method === 'POST' && tasksMatch) {
    try {
      const projectId = Number(tasksMatch[1]);
      if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const { title } = await readBody(request);
      const cleanTitle = typeof title === 'string' ? title.trim() : '';
      if (!cleanTitle) return sendJson(response, 400, { error: 'Task title is required' });
      const result = createTask.run(projectId, cleanTitle);
      return sendJson(response, 201, getTask.get(Number(result.lastInsertRowid), projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const { completed } = await readBody(request);
      if (typeof completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
      updateTask.run(completed ? 1 : 0, taskId, projectId);
      const task = getTask.get(taskId, projectId);
      return task ? sendJson(response, 200, task) : sendJson(response, 404, { error: 'Task not found' });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const page = await readFile(join(root, 'public', 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    } catch {
      response.writeHead(500);
      return response.end('Application unavailable');
    }
  }
  if (request.method === 'GET' && ['/app.js', '/styles.css'].includes(url.pathname)) {
    const type = url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
    try {
      const content = await readFile(join(root, 'public', url.pathname.slice(1)));
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    } catch {
      response.writeHead(404);
      return response.end('Not found');
    }
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0');
