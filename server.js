import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
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
// Upgrade databases created before project archiving was introduced.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id ASC`).all().map(p => ({ ...p, archived: !!p.archived, summary: `${p.completed_count}/${p.total_count} completed` })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && req.method === 'POST') {
    const changed = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return changed.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameMatch[1]));
      return result.changes ? send(res, 200, { ok: true, name }) : send(res, 404, { error: 'Project not found or archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskListMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskListMatch && req.method === 'GET') {
    return send(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC').all(Number(taskListMatch[1])).map(t => ({ ...t, completed: !!t.completed })));
  }
  if (taskListMatch && req.method === 'POST') {
    try {
      const projectId = Number(taskListMatch[1]);
      const owner = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
      if (!owner) return send(res, 404, { error: 'Project not found' });
      if (owner.archived) return send(res, 403, { error: 'Archived projects cannot have tasks' });
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (taskRenameMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND project_id IN
        (SELECT id FROM projects WHERE archived = 0)`).run(title, Number(taskRenameMatch[1]));
      return result.changes ? send(res, 200, { ok: true, title }) : send(res, 404, { error: 'Task not found or project archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      if (typeof body.completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN
        (SELECT id FROM projects WHERE archived = 0)`).run(body.completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Task not found' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, { ...project, archived: !!project.archived }) : send(res, 404, { error: 'Project not found' });
  }
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (req.method === 'GET') {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = ['app.js', 'style.css'].includes(requested) ? requested : 'index.html';
    try {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(join(root, 'public', path));
      const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type }); return res.end(content);
    } catch { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
