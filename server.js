import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
);`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const html = await readFile(path.join(here, 'index.html'));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' });
  res.end(body);
}
async function requestBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try { return JSON.parse(data || '{}'); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(res, 200, JSON.stringify(db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
      FROM projects p ORDER BY p.id`).all().map(p => ({ ...p, archived: Boolean(p.archived) }))));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await requestBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const projectAction = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectAction && req.method === 'PATCH') {
    const body = await requestBody(req);
    const projectId = Number(projectAction[1]);
    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return send(res, 200, JSON.stringify({ ok: true, name }));
    }
    if (typeof body?.archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.archived), projectId);
    if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    return send(res, 200, JSON.stringify({ ok: true }));
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (!taskRoute[2] && req.method === 'GET') {
      return send(res, 200, JSON.stringify(db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(t => ({ ...t, completed: Boolean(t.completed) }))));
    }
    if (!taskRoute[2] && req.method === 'POST') {
      const body = await requestBody(req);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false, priority: 'Normal' }));
    }
    if (taskRoute[2] && req.method === 'PATCH') {
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
      const body = await requestBody(req);
      if (typeof body?.title === 'string') {
        const title = body.title.trim();
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, Number(taskRoute[2]), projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify({ ok: true, title }));
      }
      if (typeof body?.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) return send(res, 400, JSON.stringify({ error: 'Invalid priority' }));
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(body.priority, Number(taskRoute[2]), projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify({ ok: true }));
      }
      if (typeof body?.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), Number(taskRoute[2]), projectId);
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
      return send(res, 200, JSON.stringify({ ok: true }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(res, 200, html, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
