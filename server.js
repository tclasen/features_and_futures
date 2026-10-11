import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
db.exec('PRAGMA foreign_keys = ON');
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const readBody = async () => { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Body too large'); } return JSON.parse(raw); };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try { const data = await readBody(); if (typeof data.name !== 'string' || !data.name.trim()) return send(400, { error: 'Project name is required' }); const name = data.name.trim(); const result = db.prepare('INSERT INTO projects(name) VALUES (?)').run(name); return send(201, { id: Number(result.lastInsertRowid), name }); } catch { return send(400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId)) return send(404, { error: 'Project not found' });
    if (req.method === 'GET') return send(200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id=? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (req.method === 'POST') {
      try { const data = await readBody(); if (typeof data.title !== 'string' || !data.title.trim()) return send(400, { error: 'Task title is required' }); const title = data.title.trim(); const result = db.prepare('INSERT INTO tasks(project_id,title) VALUES (?,?)').run(projectId, title); return send(201, { id: Number(result.lastInsertRowid), title, completed: false }); } catch { return send(400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try { const data = await readBody(); if (typeof data.completed !== 'boolean') return send(400, { error: 'Invalid completion state' }); const result = db.prepare('UPDATE tasks SET completed=? WHERE id=?').run(data.completed ? 1 : 0, Number(taskMatch[1])); return result.changes ? send(200, { completed: data.completed }) : send(404, { error: 'Task not found' }); } catch { return send(400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) { const project = db.prepare('SELECT id, name FROM projects WHERE id=?').get(Number(projectMatch[1])); return project ? send(200, project) : send(404, { error: 'Project not found' }); }
  if (req.method === 'GET') {
    const file = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname) ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..') || file.includes('\\')) return send(404, 'Not found', 'text/plain');
    try { return send(200, readFileSync(join(root, 'public', file)), mime[extname(file)] || 'application/octet-stream'); } catch { return send(404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
