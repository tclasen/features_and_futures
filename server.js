import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

const indexHtml = await readFile(new URL('./index.html', import.meta.url));
const sendJson = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const readBody = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (!taskRoute[2] && req.method === 'GET') {
      return sendJson(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (!taskRoute[2] && req.method === 'POST') {
      const body = await readBody(req);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    }
    if (taskRoute[2] && req.method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body?.completed !== 'boolean') return sendJson(res, 400, { error: 'completed must be a boolean' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), Number(taskRoute[2]), projectId);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { ok: true });
    }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
process.on('SIGINT', () => { db.close(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { db.close(); server.close(() => process.exit(0)); });
