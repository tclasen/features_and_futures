import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(here, 'index.html'));

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, listProjects.all());
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskMatch) {
    const projectId = Number(taskMatch[1]);
    if (!findProject.get(projectId)) return sendJson(res, 404, { error: 'Not found' });
    if (!taskMatch[2] && req.method === 'GET') return sendJson(res, 200, listTasks.all(projectId));
    if (!taskMatch[2] && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0 });
      } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
    if (taskMatch[2] && req.method === 'PATCH') {
      try {
        const taskId = Number(taskMatch[2]);
        if (!findTask.get(taskId, projectId)) return sendJson(res, 404, { error: 'Not found' });
        const body = await readBody(req);
        if (typeof body.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
        updateTask.run(body.completed ? 1 : 0, taskId, projectId);
        return sendJson(res, 200, { id: taskId, completed: body.completed });
      } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
