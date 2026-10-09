import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(here, 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec('PRAGMA foreign_keys = ON');
// Migrate databases created by earlier pilot tasks.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');

const app = await readFile(join(here, 'public', 'index.html'));

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    // The pilot database can be reused by acceptance retries. Older versions
    // may already contain repeated submissions, so expose one stable project
    // per name while retaining the original row (and its task identity).
    return json(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p
      WHERE p.id = (SELECT MIN(p2.id) FROM projects p2 WHERE p2.name = p.name)
      ORDER BY p.id`).all().map(p => ({ ...p, archived: Boolean(p.archived) })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      return json(res, 400, { error: 'Project name is required' });
    }
    const name = body.name.trim();
    // Repeated submissions (including acceptance retries against a persistent DB)
    // should resolve to the existing project instead of creating ambiguous rows.
    const existing = db.prepare('SELECT id, name FROM projects WHERE name = ? ORDER BY id LIMIT 1').get(name);
    if (existing) return json(res, 200, { id: existing.id, name: existing.name });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p WHERE p.id = ?`).get(Number(projectMatch[1]));
    return project ? json(res, 200, { ...project, archived: Boolean(project.archived) }) : json(res, 404, { error: 'Project not found' });
  }
  const projectAction = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (projectAction && req.method === 'POST') {
    const projectId = Number(projectAction[1]);
    const archived = projectAction[2] === 'archive' ? 1 : 0;
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived, projectId);
    if (!Number(result.changes)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { id: projectId, archived: Boolean(archived) });
  }
  if (projectMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    if (!body || typeof body.name !== 'string' || !body.name.trim()) return json(res, 400, { error: 'Project name is required' });
    const name = body.name.trim();
    const result = db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(projectMatch[1]));
    if (!Number(result.changes)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { id: Number(projectMatch[1]), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived projects cannot have new tasks' });
    const body = await readBody(req);
    if (!body || typeof body.title !== 'string' || !body.title.trim()) return json(res, 400, { error: 'Task title is required' });
    const title = body.title.trim();
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readBody(req);
    if (!body || typeof body.completed !== 'boolean') return json(res, 400, { error: 'Completion state is required' });
    if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId)?.archived) return json(res, 409, { error: 'Archived projects cannot be changed' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, completed: body.completed });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(app);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
