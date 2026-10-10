import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(here, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`
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

const indexHtml = await readFile(path.join(here, 'index.html'));
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (typeof input.completed !== 'boolean') return json(res, 400, { error: 'Completion state is required' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(input.completed ? 1 : 0, Number(taskMatch[1]));
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Task not found' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
