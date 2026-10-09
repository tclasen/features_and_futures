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
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const appHtml = await readFile(path.join(root, 'public', 'index.html'));
const styles = await readFile(path.join(root, 'public', 'styles.css'));
const script = await readFile(path.join(root, 'public', 'app.js'));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(res, 200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    let data;
    try { data = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
      return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && taskId === null) {
      const tasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)
        .map(task => ({ ...task, completed: Boolean(task.completed) }));
      return send(res, 200, JSON.stringify(tasks));
    }
    if (req.method === 'POST' && taskId === null) {
      let raw = '';
      req.setEncoding('utf8');
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    }
    if (req.method === 'PATCH' && taskId !== null) {
      let raw = '';
      req.setEncoding('utf8');
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
      if (typeof data.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(data.completed), taskId, projectId);
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
      return send(res, 200, JSON.stringify({ id: taskId, completed: data.completed }));
    }
  }
  if (req.method === 'GET' && url.pathname === '/assets/styles.css') return send(res, 200, styles, 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/assets/app.js') return send(res, 200, script, 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(res, 200, appHtml, 'text/html; charset=utf-8');
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
