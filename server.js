import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}
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

const html = await readFile(new URL('./index.html', import.meta.url));
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const readJson = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    const projects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived=? AND p.id = (SELECT MIN(p2.id) FROM projects p2 WHERE p2.name=p.name AND p2.archived=p.archived) GROUP BY p.id ORDER BY p.id`).all(archived).map(p => ({ ...p, archived: Boolean(p.archived) }));
    return send(res, 200, JSON.stringify(projects));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }));
    return send(res, 200, JSON.stringify(tasks));
  }
  if (tasksMatch && req.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    const body = await readJson(req);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    if (typeof body?.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, Number(taskMatch[1]));
    if (!Number(result.changes)) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
    return send(res, 200, JSON.stringify({ ok: true }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    if (typeof body?.archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
    const result = db.prepare('UPDATE projects SET archived=? WHERE id=?').run(body.archived ? 1 : 0, Number(projectMatch[1]));
    if (!Number(result.changes)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    return send(res, 200, JSON.stringify({ ok: true }));
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return send(res, 200, html, 'text/html; charset=utf-8');
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
