import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.exec('PRAGMA foreign_keys = ON');

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });

  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)(?:\/tasks)?$/);
  if (projectMatch) {
    const projectId = Number(projectMatch[1]);
    const isTasks = url.pathname.endsWith('/tasks');
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (isTasks && req.method === 'GET') {
      const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      return sendJson(res, 200, tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (isTasks && req.method === 'POST') {
      const body = await readBody(req);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    }
    if (!isTasks && req.method === 'GET') return sendJson(res, 200, project);
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    if (typeof body?.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), Number(taskMatch[2]), Number(taskMatch[1]));
    return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Task not found' });
  }

  if (req.method === 'GET') {
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { pathname = '/'; }
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve(root, 'public', requested);
    if (filePath.startsWith(resolve(root, 'public') + '/') || filePath === resolve(root, 'public', 'index.html')) {
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
        return res.end(data);
      } catch { /* Serve the app shell for project routes. */ }
    }
    if (pathname === '/' || /^\/projects\/\d+$/.test(pathname)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(join(root, 'public', 'index.html')));
    }
  }
  sendJson(res, 404, { error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
