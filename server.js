import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = process.env.DB_PATH ?? join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const send = (res, status, body, contentType = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id`).all().map((p) => ({ ...p, archived: Boolean(p.archived) })));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      if (typeof payload.archived !== 'boolean') return send(res, 400, { error: 'Archive state is required' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(payload.archived ? 1 : 0, Number(projectMatch[1]));
      if (!result.changes) return send(res, 404, { error: 'Project not found' });
      return send(res, 200, { id: Number(projectMatch[1]), archived: payload.archived });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, { error: 'Project not found' });
      if (project.archived) return send(res, 409, { error: 'Archived projects cannot receive tasks' });
      const payload = await readJson(req);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      if (typeof payload.completed !== 'boolean') return send(res, 400, { error: 'Completion state is required' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(payload.completed ? 1 : 0, Number(taskMatch[1]));
      if (!result.changes) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, { id: Number(taskMatch[1]), completed: payload.completed });
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(res, 200, readFileSync(join(root, 'app.js')), 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    return send(res, 200, readFileSync(join(root, 'styles.css')), 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(res, 200, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title><link rel="stylesheet" href="/styles.css"></head><body><main id="app" aria-live="polite"></main><script type="module" src="/app.js"></script></body></html>', 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
