import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);

const html = await readFile(new URL('./index.html', import.meta.url));
const send = (res, status, data, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  const match = url.pathname.match(/^\/projects\/(\d+)$/);
  if (req.method === 'GET' && match) return send(res, 200, html, 'text/html; charset=utf-8');
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') {
    return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskRoute[1])).map(task => ({...task, completed: Boolean(task.completed)})));
  }
  if (taskRoute && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(taskRoute[1]))) return send(res, 404, { error: 'Project not found' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(Number(taskRoute[1]), title);
      return send(res, 201, { id: Number(result.lastInsertRowid), projectId: Number(taskRoute[1]), title, completed: false });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskUpdate = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(input.completed ? 1 : 0, Number(taskUpdate[1]));
      return send(res, 200, { ok: true });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
