import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
// Upgrade databases created by earlier checkpoints.
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}

const htmlPath = path.join(import.meta.dirname, 'index.html');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/health' && req.method === 'GET') {
    return send(200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`).all();
    return send(200, JSON.stringify(projects));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (archiveRoute && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const archived = Boolean(JSON.parse(body).archived);
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, Number(archiveRoute[1]));
      if (!result.changes) return send(404, JSON.stringify({ error: 'Project not found' }));
      return send(200, JSON.stringify({ ok: true }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameRoute && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameRoute[1]));
      if (!result.changes) {
        const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(renameRoute[1]));
        return send(project ? 400 : 404, JSON.stringify({ error: project ? 'Archived project' : 'Project not found' }));
      }
      return send(200, JSON.stringify({ name }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') {
      const tasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      return send(200, JSON.stringify(tasks.map(task => ({ ...task, completed: Boolean(task.completed) }))));
    }
    if (req.method === 'POST') {
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) return send(400, JSON.stringify({ error: 'Archived project' }));
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const taskRename = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (taskRename && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const title = String(JSON.parse(body).title ?? '').trim();
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(taskRename[1]));
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) return send(400, JSON.stringify({ error: 'Archived project' }));
      db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, Number(taskRename[1]));
      return send(200, JSON.stringify({ title }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskUpdate = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(taskUpdate[1]));
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) return send(400, JSON.stringify({ error: 'Archived project' }));
      const completed = Boolean(JSON.parse(body).completed);
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskUpdate[1]));
      if (!result.changes) return send(404, JSON.stringify({ error: 'Task not found' }));
      return send(200, JSON.stringify({ ok: true }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'Not found' }));
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try { return send(200, await readFile(htmlPath, 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
