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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
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
    return send(res, 200, JSON.stringify(db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`).all().map(p => ({ ...p, archived: Boolean(p.archived) }))));
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
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)\/?$/);
  if (req.method === 'POST' && archiveRoute) {
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveRoute[2] === 'archive' ? 1 : 0, Number(archiveRoute[1]));
    return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') return send(res, 200, JSON.stringify(db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
    if (req.method === 'POST') return readBody(req, res, body => {
      if (project.archived) return send(res, 403, JSON.stringify({ error: 'Archived project' }));
      const title = String(body.title ?? '').trim();
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    });
  }
  const completionRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/?$/);
  if (req.method === 'PATCH' && completionRoute) return readBody(req, res, body => {
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(body.completed ? 1 : 0, Number(completionRoute[1]));
    return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Task not found' }));
  });
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(id);
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(res, 200, html, 'text/html; charset=utf-8');
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
