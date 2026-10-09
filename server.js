import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
      return send(res, 200, JSON.stringify(listProjects.all(archived).map(project => ({ ...project, archived: Boolean(project.archived) }))));
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const input = await bodyJson(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (req.method === 'GET') {
        const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
        return send(res, 200, JSON.stringify(tasks.map(task => ({ ...task, completed: Boolean(task.completed) }))));
      }
      if (req.method === 'POST') {
        const projectState = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
        if (projectState.archived) return send(res, 409, JSON.stringify({ error: 'Archived projects cannot have new tasks' }));
        const input = await bodyJson(req);
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
      }
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === 'PATCH' && taskMatch) {
      const input = await bodyJson(req);
      const taskOwner = db.prepare('SELECT p.archived FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?').get(Number(taskMatch[1]));
      if (taskOwner?.archived) return send(res, 409, JSON.stringify({ error: 'Archived project tasks cannot be changed' }));
      if (typeof input.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(input.completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Task not found' }));
    }
    const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
    if (req.method === 'PATCH' && archiveMatch) {
      const input = await bodyJson(req);
      if (typeof input.archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(input.archived ? 1 : 0, Number(archiveMatch[1]));
      return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
    }
    const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'PATCH' && match) {
      const input = await bodyJson(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(match[1]));
      return result.changes ? send(res, 200, JSON.stringify({ id: Number(match[1]), name })) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && match) {
      const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(match[1]));
      if (project) project.archived = Boolean(project.archived);
      return project
        ? send(res, 200, JSON.stringify(project))
        : send(res, 404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/')) {
      return send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    return send(res, 404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    const status = error.message === 'Request body too large' ? 413 : 400;
    return send(res, status, JSON.stringify({ error: status === 413 ? error.message : 'Invalid request' }));
  }
});

server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
