import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const dbPath = process.env.DB_PATH ?? './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

async function serveAsset(pathname, response) {
  // Project pages are client-rendered, so direct visits and reloads must load
  // the application shell before the browser can request the project data.
  const isProjectPage = /^\/projects\/\d+\/?$/.test(pathname);
  const requestedPath = pathname === '/' || isProjectPage ? '/index.html' : pathname;
  const relativePath = normalize(requestedPath).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  if (!relativePath || relativePath.includes('..')) {
    response.writeHead(400).end();
    return;
  }
  try {
    const body = await readFile(join('public', relativePath));
    response.writeHead(200, { 'content-type': contentTypes[extname(relativePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readBody(request);
      if (typeof name !== 'string' || !name.trim()) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name.trim());
      sendJson(response, 201, getProject.get(result.lastInsertRowid));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project ?? { error: 'Project not found' });
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST') {
      try {
        const { title } = await readBody(request);
        if (typeof title !== 'string' || !title.trim()) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const result = createTask.run(projectId, title.trim());
        sendJson(response, 201, getTask.get(result.lastInsertRowid, projectId));
      } catch {
        sendJson(response, 400, { error: 'Invalid request' });
      }
      return;
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const { completed } = await readBody(request);
      if (typeof completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion must be a boolean' });
        return;
      }
      if (!getTask.get(taskId, projectId)) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      updateTask.run(completed ? 1 : 0, taskId, projectId);
      sendJson(response, 200, getTask.get(taskId, projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    await serveAsset(url.pathname, response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
