import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
// Keep existing Task 001/002 databases usable when the archive feature is added.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);

const page = await readFile(join(root, 'public', 'index.html'));
const script = await readFile(join(root, 'public', 'app.js'));
const style = await readFile(join(root, 'public', 'style.css'));

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(value);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all()));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const input = await readJson(req);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectRoute) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectRoute[1]));
    return project
      ? send(res, 200, JSON.stringify(project))
      : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveRoute) {
    const [, rawId, action] = archiveRoute;
    const id = Number(rawId);
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(action === 'archive' ? 1 : 0, id);
    return result.changes
      ? send(res, 200, JSON.stringify({ id, archived: action === 'archive' ? 1 : 0 }))
      : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const tasksRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksRoute) {
    const projectId = Number(tasksRoute[1]);
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') {
      return send(res, 200, JSON.stringify(db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)));
    }
    if (req.method === 'POST') {
      const input = await readJson(req);
      const title = typeof input?.title === 'string' ? input.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: 0 }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskRoute) {
    const [projectId, taskId] = taskRoute.slice(1).map(Number);
    const input = await readJson(req);
    if (typeof input?.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Completion state is required' }));
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(input.completed ? 1 : 0, taskId, projectId);
    return result.changes
      ? send(res, 200, JSON.stringify({ id: taskId, projectId, completed: input.completed ? 1 : 0 }))
      : send(res, 404, JSON.stringify({ error: 'Task not found' }));
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(res, 200, script, 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/style.css') {
    return send(res, 200, style, 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
