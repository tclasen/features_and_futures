import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
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
database.exec('PRAGMA foreign_keys = ON');

const indexHtml = await readFile(path.join(root, 'index.html'));
const clientJs = await readFile(path.join(root, 'app.js'));
const css = await readFile(path.join(root, 'style.css'));

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
  }
  if (tasksMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const projectId = Number(tasksMatch[1]);
    if (!database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0 });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    if (typeof data.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    return result.changes ? sendJson(res, 200, { completed: data.completed }) : sendJson(res, 404, { error: 'Task not found' });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(clientJs);
  }
  if (req.method === 'GET' && url.pathname === '/style.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return res.end(css);
  }
  if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
