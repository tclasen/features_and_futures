import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(base, 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(base, 'public', 'index.html'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      if (name.length > 500) return send(400, JSON.stringify({ error: 'Project name is too long' }));
      const id = randomUUID();
      insertProject.run(id, name, Date.now());
      return send(201, JSON.stringify({ id, name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    if (!findProject.get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET' && !taskMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !taskMatch[2]) {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const title = String(JSON.parse(raw).title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        if (title.length > 500) return send(400, JSON.stringify({ error: 'Task title is too long' }));
        const id = randomUUID(); insertTask.run(id, projectId, title, Date.now());
        return send(201, JSON.stringify({ id, title, completed: 0 }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (req.method === 'PATCH' && taskMatch[2]) {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const completed = JSON.parse(raw).completed ? 1 : 0;
        const result = updateTask.run(completed, decodeURIComponent(taskMatch[2]), projectId);
        return Number(result.changes) ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const item = findProject.get(decodeURIComponent(match[1]));
    return item ? send(200, JSON.stringify(item)) : send(404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'Not found' }));
  return send(404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
