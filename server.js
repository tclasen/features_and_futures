import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High')));
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    created_at INTEGER NOT NULL
  );
`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!projectColumns.some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare('SELECT p.id, p.name, p.archived, p.default_priority, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count FROM projects p ORDER BY p.created_at, p.rowid').all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/?$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const projectId = decodeURIComponent(tasksMatch[1]);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot be changed' });
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const id = randomUUID();
      db.prepare('INSERT INTO tasks (id, project_id, title, completed, priority, created_at) VALUES (?, ?, ?, 0, (SELECT default_priority FROM projects WHERE id = ?), ?)').run(id, projectId, title, projectId, Date.now());
      return json(res, 201, { id, title, completed: false });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/rename\/?$/);
  if (renameTaskMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(title, decodeURIComponent(renameTaskMatch[1]));
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { title });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const priorityMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/priority\/?$/);
  if (priorityMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
      const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(body.priority, decodeURIComponent(priorityMatch[1]));
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { priority: body.priority });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/?$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      if (typeof body.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(Number(body.completed), decodeURIComponent(taskMatch[1]));
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { completed: body.completed });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/?$/);
  if (renameMatch && req.method === 'PATCH') {
    try {
      const id = decodeURIComponent(renameMatch[1]);
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, id);
      if (!result.changes) return json(res, 404, { error: 'Active project not found' });
      return json(res, 200, { id, name });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority\/?$/);
  if (defaultPriorityMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(body.priority, decodeURIComponent(defaultPriorityMatch[1]));
      if (!result.changes) return json(res, 404, { error: 'Active project not found' });
      return json(res, 200, { default_priority: body.priority });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)\/?$/);
  if (archiveMatch && req.method === 'POST') {
    const id = decodeURIComponent(archiveMatch[1]);
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, id);
    if (!result.changes) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { archived: archiveMatch[2] === 'archive' });
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const id = randomUUID();
      db.prepare('INSERT INTO projects (id, name, created_at, archived) VALUES (?, ?, ?, 0)').run(id, name, Date.now());
      return json(res, 201, { id, name });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET') {
    // Project URLs are client-side routes; serve the app shell on direct visits/reloads.
    const isProjectPage = /^\/projects\/[^/]+\/?$/.test(url.pathname);
    const relative = url.pathname === '/' || isProjectPage ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = resolve(root, 'public', relative);
    if (!path.startsWith(resolve(root, 'public') + '/') && path !== resolve(root, 'public')) return text(res, 404, 'Not found');
    try {
      const content = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
      return res.end(content);
    } catch { return text(res, 404, 'Not found'); }
  }
  text(res, 404, 'Not found');
});
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
function text(res, status, value) { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(value); }
async function readBody(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
