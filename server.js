import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
const { mkdir } = await import('node:fs/promises');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return send(res, 400, { error: 'Invalid request' }); }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
    return send(res, 201, project);
  }
  const projectTasks = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (projectTasks) {
    let projectId;
    try { projectId = decodeURIComponent(projectTasks[1]); } catch { return send(res, 400, { error: 'Invalid project id' }); }
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId));
    }
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let title;
      try { title = JSON.parse(body).title; } catch { return send(res, 400, { error: 'Invalid request' }); }
      title = typeof title === 'string' ? title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), projectId, title, completed: 0 };
      db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, projectId, title, Date.now());
      return send(res, 201, task);
    }
  }
  const taskCompletion = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskCompletion) {
    let projectId, taskId;
    try { projectId = decodeURIComponent(taskCompletion[1]); taskId = decodeURIComponent(taskCompletion[2]); } catch { return send(res, 400, { error: 'Invalid task id' }); }
    let body = '';
    for await (const chunk of req) body += chunk;
    let completed;
    try { completed = JSON.parse(body).completed; } catch { return send(res, 400, { error: 'Invalid request' }); }
    if (typeof completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { id: taskId, projectId, completed: completed ? 1 : 0 });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application page unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && /^\/projects\/[^/]+$/.test(url.pathname)) {
    return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
