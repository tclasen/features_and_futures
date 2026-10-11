import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join, extname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
const root = new URL('.', import.meta.url).pathname;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.completed=1) AS completed_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS total_count
      FROM projects p ORDER BY p.id`).all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (typeof data.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
    const result = db.prepare('UPDATE projects SET archived=? WHERE id=?').run(data.archived ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
  }
  if (tasksMatch && req.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    const owner = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (owner?.archived) return json(res, 403, { error: 'Project is archived' });
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return json(res, 201, { id: Number(result.lastInsertRowid), title, completed: 0 });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const task = db.prepare('SELECT project_id FROM tasks WHERE id=?').get(Number(taskMatch[1]));
    if (!task) return json(res, 404, { error: 'Task not found' });
    if (db.prepare('SELECT archived FROM projects WHERE id=?').get(task.project_id)?.archived) return json(res, 403, { error: 'Project is archived' });
    if (typeof data.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return json(res, 400, { error: 'Invalid priority' });
      db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(data.priority, Number(taskMatch[1]));
      return json(res, 200, { ok: true, priority: data.priority });
    }
    if (typeof data.title === 'string') {
      const title = data.title.trim();
      if (!title) return json(res, 400, { error: 'Task title is required' });
      db.prepare('UPDATE tasks SET title=? WHERE id=?').run(title, Number(taskMatch[1]));
      return json(res, 200, { ok: true, title });
    }
    if (typeof data.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
    db.prepare('UPDATE tasks SET completed=? WHERE id=?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    return json(res, 200, { ok: true });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const id = Number(projectMatch[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id=?').get(id);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 403, { error: 'Project is archived' });
    db.prepare('UPDATE projects SET name=? WHERE id=?').run(name, id);
    return json(res, 200, { ok: true, name });
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET') {
    const file = url.pathname === '/' || url.pathname.startsWith('/projects/') ? 'index.html' : url.pathname.slice(1);
    try {
      const content = await readFile(join(root, 'public', file));
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      return res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
  }
  json(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
