import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
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
)`);
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res, status, value) => send(res, status, JSON.stringify(value));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (taskRoute && req.method === 'GET') {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskRoute && req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const projectId = Number(taskRoute[1]);
      if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const completionRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/?$/);
  if (completionRoute && req.method === 'PATCH') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      if (typeof parsed.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(Number(parsed.completed), Number(completionRoute[1]));
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { status: 'ok' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Application unavailable' });
    }
  }
  json(res, 404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
