import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(here, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(here, 'index.html'));

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, listProjects.all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      let body = '';
      try {
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return sendJson(res, 201, getTask.get(Number(result.lastInsertRowid), projectId));
      } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      const projectId = Number(taskMatch[1]), taskId = Number(taskMatch[2]);
      updateTask.run(data.completed ? 1 : 0, taskId, projectId);
      const task = getTask.get(taskId, projectId);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, task);
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    if (Number.isInteger(id) && id > 0) {
      const project = getProject.get(id);
      if (project) return sendJson(res, 200, project);
    }
    return sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
