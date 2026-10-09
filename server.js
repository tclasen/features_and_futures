import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
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
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

const publicDir = new URL('./public/', import.meta.url);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    if (req.method === 'GET' && !taskRoute[2]) {
      return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
    }
    let body;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      body = JSON.parse(raw);
    } catch { return json(res, 400, { error: 'Invalid request' }); }
    if (req.method === 'POST' && !taskRoute[2]) {
      if (typeof body.title !== 'string' || !body.title.trim()) return json(res, 400, { error: 'Task title is required' });
      const title = body.title.trim();
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0 });
    }
    if (req.method === 'PATCH' && taskRoute[2]) {
      if (typeof body.completed !== 'boolean') return json(res, 400, { error: 'Completion must be boolean' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), Number(taskRoute[2]), projectId);
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return json(res, 400, { error: 'Invalid request' }); }
    if (typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name.trim());
    return json(res, 201, { id: Number(result.lastInsertRowid), name: name.trim() });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(new URL('index.html', publicDir));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch { return json(res, 500, { error: 'Application unavailable' }); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const filename = url.pathname.slice('/assets/'.length);
    if (!['app.js', 'style.css'].includes(filename)) return json(res, 404, { error: 'Not found' });
    try {
      const data = await readFile(new URL(filename, publicDir));
      res.writeHead(200, { 'content-type': contentTypes[extname(filename)] });
      return res.end(data);
    } catch { return json(res, 404, { error: 'Not found' }); }
  }
  return json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
