import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8080);
const database = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const createTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { data += chunk; });
    request.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health' && request.method === 'GET') {
    return json(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return json(response, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return json(response, 400, { error: 'Invalid JSON' });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    createProject.run(project.id, project.name, Date.now());
    return json(response, 201, project);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = findProject.get(decodeURIComponent(projectMatch[1]));
    return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return json(response, 200, listTasks.all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
    if (request.method === 'POST') {
      let body;
      try { body = await readJson(request); } catch { return json(response, 400, { error: 'Invalid JSON' }); }
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return json(response, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), projectId, title, completed: false };
      createTask.run(task.id, projectId, title, Date.now());
      return json(response, 201, task);
    }
  }
  const completionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (completionMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return json(response, 400, { error: 'Invalid JSON' }); }
    if (typeof body.completed !== 'boolean') return json(response, 400, { error: 'Completion state is required' });
    const result = updateTask.run(body.completed ? 1 : 0, decodeURIComponent(completionMatch[2]), decodeURIComponent(completionMatch[1]));
    return result.changes ? json(response, 200, { completed: body.completed }) : json(response, 404, { error: 'Task not found' });
  }

  const assetPath = url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname) ? 'index.html' : normalize(url.pathname).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  const filePath = join(process.cwd(), 'public', assetPath);
  try {
    const content = await readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

createServer((request, response) => {
  handle(request, response).catch(() => {
    if (!response.headersSent) json(response, 500, { error: 'Internal server error' });
    else response.destroy();
  });
}).listen(port, '0.0.0.0');
