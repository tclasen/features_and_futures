import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
db.exec('PRAGMA foreign_keys = ON');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const getProject = db.prepare('SELECT id FROM projects WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const createTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(listProjects.all())); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project name is required' })); return; }
      const project = { id: randomUUID(), name };
      createProject.run(project.id, name, Date.now());
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(project));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid request' })); }
    return;
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (taskRoute) {
    const projectId = decodeURIComponent(taskRoute[1]);
    if (!getProject.get(projectId)) { res.writeHead(404); res.end('Not found'); return; }
    if (!taskRoute[2] && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(listTasks.all(projectId))); return; }
    if (!taskRoute[2] && req.method === 'POST') {
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task title is required' })); return; }
        const task = { id: randomUUID(), title, completed: 0 };
        createTask.run(task.id, projectId, title, Date.now());
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(task)); return;
      } catch { res.writeHead(400); res.end('Invalid request'); return; }
    }
    if (taskRoute[2] && req.method === 'PATCH') {
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const completed = JSON.parse(body).completed ? 1 : 0;
        const result = updateTask.run(completed, decodeURIComponent(taskRoute[2]), projectId);
        if (!result.changes) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(204); res.end(); return;
      } catch { res.writeHead(400); res.end('Invalid request'); return; }
    }
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const html = await readFile(path.join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch { res.writeHead(500); res.end('Application unavailable'); }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
