import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  const { dirname: pathDirname } = await import('node:path');
  await mkdir(pathDirname(dbPath), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  const taskRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (taskRoute) {
    const projectId = decodeURIComponent(taskRoute[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET' && !taskRoute[2]) {
      return send(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (req.method === 'POST' && !taskRoute[2]) {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const { title } = JSON.parse(raw);
        if (typeof title !== 'string' || !title.trim()) return send(res, 400, { error: 'Task title is required' });
        const task = { id: randomUUID(), title: title.trim(), completed: false };
        db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, projectId, task.title, Date.now());
        return send(res, 201, task);
      } catch { return send(res, 400, { error: 'Invalid request' }); }
    }
    if (req.method === 'PATCH' && taskRoute[2]) {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const { completed } = JSON.parse(raw);
        if (typeof completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
        const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(completed ? 1 : 0, decodeURIComponent(taskRoute[2]), projectId);
        return result.changes ? send(res, 200, { completed }) : send(res, 404, { error: 'Task not found' });
      } catch { return send(res, 400, { error: 'Invalid request' }); }
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { name } = JSON.parse(raw);
      if (typeof name !== 'string' || !name.trim()) return send(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name: name.trim() };
      db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
      return send(res, 201, project);
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(res, 404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
