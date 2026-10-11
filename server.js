import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.id`);
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ status: 'ok' }));
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  const taskUpdateRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') return send(res, 200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Archived project' }));
      try {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' })); }
        const input = JSON.parse(raw || '{}');
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title);
        return send(res, 201, JSON.stringify(getTask.get(result.lastInsertRowid, projectId)));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  if (taskUpdateRoute && req.method === 'PATCH') {
    const projectId = Number(taskUpdateRoute[1]), taskId = Number(taskUpdateRoute[2]);
    try {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' })); }
      const input = JSON.parse(raw || '{}');
      if (typeof input.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Completion must be boolean' }));
      if (!getTask.get(taskId, projectId)) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
      if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Archived project' }));
      updateTask.run(input.completed ? 1 : 0, taskId, projectId);
      return send(res, 200, JSON.stringify(getTask.get(taskId, projectId)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveRoute && req.method === 'POST') {
    const projectId = Number(archiveRoute[1]);
    if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    setArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, projectId);
    return send(res, 200, JSON.stringify(listProjects.all().find(project => project.id === projectId)));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, JSON.stringify(listProjects.all()));
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const input = JSON.parse(raw || '{}');
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(getProject.get(result.lastInsertRowid)));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) {
    const id = url.pathname.slice('/projects/'.length);
    if (!/^\d+$/.test(id)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    if (!getProject.get(Number(id))) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(join(root, 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    try { return send(res, 200, await readFile(join(root, 'app.js'), 'utf8'), 'text/javascript; charset=utf-8'); }
    catch { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) {
    try { return send(res, 200, await readFile(join(root, 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }));
});
const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0');
