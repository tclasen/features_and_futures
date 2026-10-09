import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return send(200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (tasksMatch && req.method === 'GET') {
      const projectId = Number(tasksMatch[1]);
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
      return send(200, JSON.stringify(db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)));
    }
    if (tasksMatch && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const projectId = Number(tasksMatch[1]);
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: 0 }));
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (taskMatch && req.method === 'PATCH') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof data.completed !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
      if (!result.changes) return send(404, JSON.stringify({ error: 'Task not found' }));
      return send(200, JSON.stringify({ ok: true }));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/projects/')) {
      const id = url.pathname.slice('/projects/'.length);
      if (!/^\d+$/.test(id)) return send(404, 'Not found', 'text/plain; charset=utf-8');
      const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(id));
      if (!project) return send(404, 'Not found', 'text/plain; charset=utf-8');
      const html = await readFile(path.join(here, 'public', 'index.html'), 'utf8');
      return send(200, html, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(path.join(here, 'public', 'index.html'), 'utf8');
      return send(200, html, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/app.js') {
      return send(200, await readFile(path.join(here, 'public', 'app.js'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/style.css') {
      return send(200, await readFile(path.join(here, 'public', 'style.css'), 'utf8'), 'text/css; charset=utf-8');
    }
    send(404, 'Not found', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(500, JSON.stringify({ error: 'Internal server error' }));
  }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
