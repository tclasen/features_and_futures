import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const root = path.resolve('public');
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res, status, data) => send(res, status, JSON.stringify(data));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });

  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const taskCollection = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollection) {
    const projectId = Number(taskCollection[1]);
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Not found' });
    if (req.method === 'GET') return json(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let data;
      try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return json(res, 201, { id: Number(result.lastInsertRowid), title, completed: 0 });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (typeof data.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    return result.changes ? json(res, 200, { status: 'ok' }) : json(res, 404, { error: 'Not found' });
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(res, 200, project) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'GET') {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!file.includes('..') && !file.includes('/')) {
      try {
        const content = await readFile(path.join(root, file));
        const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
        return send(res, 200, content, type);
      } catch {}
    }
    // Client-side project routes share the same entry point.
    if (/^\/projects\/\d+\/?$/.test(url.pathname)) {
      try { return send(res, 200, await readFile(path.join(root, 'index.html')), 'text/html; charset=utf-8'); } catch {}
    }
  }
  json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
process.on('SIGINT', () => { server.close(); db.close(); });
process.on('SIGTERM', () => { server.close(); db.close(); });
