import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
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
const html = readFileSync(new URL('./index.html', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, res, callback) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => { try { callback(JSON.parse(body)); } catch { send(res, 400, JSON.stringify({ error: 'Invalid request' })); } });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const name = String(JSON.parse(body).name ?? '').trim();
        if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
        const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
        return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
      } catch {
        return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') return send(res, 200, JSON.stringify(db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
    if (req.method === 'POST') return readBody(req, res, body => {
      const title = String(body.title ?? '').trim();
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    });
  }
  const completionRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/?$/);
  if (req.method === 'PATCH' && completionRoute) return readBody(req, res, body => {
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, Number(completionRoute[1]));
    return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Task not found' }));
  });
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(res, 200, html, 'text/html; charset=utf-8');
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
