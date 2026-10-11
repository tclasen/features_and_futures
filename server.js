import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
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
);`);

try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

const indexHtml = await readFile(new URL('./public/index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' });
    res.end(body);
  };

  if (url.pathname === '/health' && req.method === 'GET') {
    return send(200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    return send(200, JSON.stringify(db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p WHERE p.archived = ? ORDER BY p.id`).all(archived)));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const archived = JSON.parse(raw).archived ? 1 : 0;
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived, archiveMatch[1]);
      return result.changes ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(tasksMatch[1]);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    return send(200, JSON.stringify(db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(tasksMatch[1])));
  }
  if (tasksMatch && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(tasksMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
      if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      const title = String(JSON.parse(raw).title ?? '').trim();
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(tasksMatch[1], title);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: 0 }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const completed = JSON.parse(raw).completed ? 1 : 0;
      const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(completed, taskMatch[1]);
      return result.changes ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(projectMatch[1]);
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (url.pathname === '/' || url.pathname.startsWith('/projects/')) {
    return send(200, indexHtml, 'text/html; charset=utf-8');
  }
  return send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0');
