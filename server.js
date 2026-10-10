import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(here, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Upgrade databases created by earlier cumulative checkpoints.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

const page = await readFile(join(here, 'index.html'), 'utf8');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p WHERE p.archived = ? ORDER BY p.id`).all(archived));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const body = await bodyJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
    }
    if (req.method === 'POST') {
      if (project.archived) return send(res, 409, { error: 'Archived project' });
      const body = await bodyJson(req);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0 });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await bodyJson(req);
    if (typeof body?.completed !== 'boolean') return send(res, 400, { error: 'Completion state is required' });
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, { error: 'Project not found' });
    if (project.archived) return send(res, 409, { error: 'Archived project' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { id: taskId, projectId, completed: body.completed ? 1 : 0 });
  }
  const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (match && req.method === 'PUT') {
    const body = await bodyJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(Number(match[1]));
    if (!project) return send(res, 404, { error: 'Project not found' });
    if (project.archived) return send(res, 409, { error: 'Archived project' });
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, project.id);
    return send(res, 200, { id: project.id, name });
  }
  if (match && req.method === 'PATCH') {
    const body = await bodyJson(req);
    if (typeof body?.archived !== 'boolean') return send(res, 400, { error: 'Archive state is required' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, Number(match[1]));
    return result.changes ? send(res, 200, { id: Number(match[1]), archived: body.archived ? 1 : 0 }) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && match) {
    const project = db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p WHERE p.id = ?`).get(Number(match[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
