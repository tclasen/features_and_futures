import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res, status, data) => send(res, status, JSON.stringify(data));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      if (typeof payload.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
      const result = updateArchived.run(payload.archived ? 1 : 0, archiveMatch[1]);
      return result.changes ? json(res, 200, { archived: payload.archived }) : json(res, 404, { error: 'Project not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return json(res, 413, { error: 'Request too large' });
      }
      const payload = JSON.parse(raw);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      insertProject.run(project.id, project.name, Date.now());
      return json(res, 201, project);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!getProject.get(tasksMatch[1])) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, listTasks.all(tasksMatch[1]).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return json(res, 413, { error: 'Request too large' });
      }
      const payload = JSON.parse(raw);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const owner = getProject.get(tasksMatch[1]);
      if (!owner) return json(res, 404, { error: 'Project not found' });
      if (owner.archived) return json(res, 403, { error: 'Archived project' });
      const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: false };
      insertTask.run(task.id, task.projectId, task.title, Date.now());
      return json(res, 201, task);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      if (typeof payload.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const owner = getProject.get(taskMatch[1]);
      if (!owner) return json(res, 404, { error: 'Project not found' });
      if (owner.archived) return json(res, 403, { error: 'Archived project' });
      const result = updateTask.run(payload.completed ? 1 : 0, taskMatch[2], taskMatch[1]);
      return result.changes ? json(res, 200, { completed: payload.completed }) : json(res, 404, { error: 'Task not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(projectMatch[1]);
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Unable to load application' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
