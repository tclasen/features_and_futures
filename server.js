import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
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
  )
`);
database.exec('PRAGMA foreign_keys = ON');

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function sendFile(response, filename, contentType) {
  try {
    const content = await readFile(join(root, filename));
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
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
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try {
      name = JSON.parse(body).name;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return sendJson(response, 400, { error: 'Project name is required' });
    }
    const trimmedName = name.trim();
    const result = createProject.run(trimmedName);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (request.method === 'POST') {
      let body;
      try { body = await readRequestJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
      if (typeof body.title !== 'string' || !body.title.trim()) return sendJson(response, 400, { error: 'Task title is required' });
      const title = body.title.trim();
      const result = createTask.run(projectId, title);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    let body;
    try { body = await readRequestJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const result = updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return sendFile(response, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return sendFile(response, 'index.html', 'text/html; charset=utf-8');
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

async function readRequestJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
