import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep databases created by earlier tasks compatible with the archive feature.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id`).all().map(project => ({
        ...project, archived: Boolean(project.archived),
        completedCount: Number(project.completedCount), totalCount: Number(project.totalCount)
      }));
    return sendJson(res, 200, projects);
  }
  const projectArchiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectArchiveRoute && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      if (typeof payload.archived !== 'boolean') return sendJson(res, 400, { error: 'Invalid archive state' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(payload.archived ? 1 : 0, Number(projectArchiveRoute[1]));
      if (!result.changes) return sendJson(res, 404, { error: 'Project not found' });
      return sendJson(res, 200, { id: Number(projectArchiveRoute[1]), archived: payload.archived });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectRenameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRenameRoute && req.method === 'PATCH') {
    try {
      const projectId = Number(projectRenameRoute[1]);
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be renamed' });
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return sendJson(res, 200, { id: projectId, name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') {
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskRoute[1]));
    return sendJson(res, 200, tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskRoute && req.method === 'POST') {
    try {
      const projectId = Number(taskRoute[1]);
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
      const payload = await readJson(req);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const taskUpdate = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      if (typeof payload.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(payload.completed ? 1 : 0, Number(taskUpdate[1]));
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: Number(taskUpdate[1]), completed: payload.completed });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500);
      return res.end('Application unavailable');
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
