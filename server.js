import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(here, 'workboard.sqlite');
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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, JSON.stringify(db.prepare('SELECT p.id, p.name, p.archived, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.completed=1) AS completedCount, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS totalCount FROM projects p ORDER BY p.id').all().map(p => ({...p, archived: Boolean(p.archived)}))));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw || '{}');
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
    return send(200, JSON.stringify(db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw || '{}');
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const projectId = Number(tasksMatch[1]);
      const owner = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!owner) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (owner.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw || '{}');
      if (typeof payload.completed !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(payload.completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify({...project, archived: Boolean(project.archived)})) : send(404, JSON.stringify({ error: 'Project not found' }));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && req.method === 'POST') {
    const archived = archiveMatch[2] === 'archive' ? 1 : 0;
    const result = db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archived, Number(archiveMatch[1]));
    return result.changes ? send(200, JSON.stringify({ok:true})) : send(404, JSON.stringify({error:'Project not found'}));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try { return send(200, await readFile(path.join(here, 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(500, 'Application file unavailable', 'text/plain; charset=utf-8'); }
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
