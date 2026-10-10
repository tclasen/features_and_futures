import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
// Keep databases created by earlier task checkpoints compatible.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec('PRAGMA foreign_keys = ON');

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id ASC`).all();
    for (const project of projects) project.archived = Boolean(project.archived);
    return send(res, 200, JSON.stringify(projects));
  }

  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const input = await readJson(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      const input = await readJson(req);
      if (typeof input.name === 'string') {
        const name = input.name.trim();
        if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
        const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
        if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
        if (project.archived) return send(res, 409, JSON.stringify({ error: 'Archived projects cannot be changed' }));
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(projectMatch[1]));
        return send(res, 200, JSON.stringify({ id: Number(projectMatch[1]), name }));
      }
      if (typeof input.archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(input.archived ? 1 : 0, Number(projectMatch[1]));
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      return send(res, 200, JSON.stringify({ id: Number(projectMatch[1]), archived: input.archived }));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id ASC').all(projectId);
    return send(res, 200, JSON.stringify(tasks.map(task => ({ ...task, completed: Boolean(task.completed) }))));
  }

  if (tasksMatch && req.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(res, 409, JSON.stringify({ error: 'Archived projects cannot be changed' }));
      const input = await readJson(req);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const input = await readJson(req);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(taskMatch[1]));
      if (project?.archived) return send(res, 409, JSON.stringify({ error: 'Archived projects cannot be changed' }));
      if (typeof input.title === 'string') {
        const title = input.title.trim();
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?').run(title, Number(taskMatch[1]), Number(taskMatch[2]));
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify({ id: Number(taskMatch[2]), projectId: Number(taskMatch[1]), title }));
      }
      if (typeof input.priority === 'string') {
        const priority = input.priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) return send(res, 400, JSON.stringify({ error: 'Invalid task priority' }));
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?').run(priority, Number(taskMatch[1]), Number(taskMatch[2]));
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify({ id: Number(taskMatch[2]), projectId: Number(taskMatch[1]), priority }));
      }
      if (typeof input.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?').run(input.completed ? 1 : 0, Number(taskMatch[1]), Number(taskMatch[2]));
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
      return send(res, 200, JSON.stringify({ id: Number(taskMatch[2]), projectId: Number(taskMatch[1]), completed: input.completed }));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = resolve(root, relative);
    if (file.startsWith(`${root}/`) || file === join(root, 'index.html')) {
      try {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(file);
        return send(res, 200, content, types[extname(file)] || 'application/octet-stream');
      } catch {
        // Unknown browser routes use the single page entry point.
      }
    }
    const { readFile } = await import('node:fs/promises');
    return send(res, 200, await readFile(join(root, 'index.html')), types['.html']);
  }

  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
