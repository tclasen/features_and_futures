import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, listProjects.all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = insertProject.run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!getProject.get(Number(tasksMatch[1]))) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, listTasks.all(Number(tasksMatch[1])));
  }
  if (tasksMatch && req.method === 'POST') {
    let input;
    try { let body = ''; for await (const chunk of req) body += chunk; input = JSON.parse(body); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    const result = insertTask.run(projectId, title);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0 });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let input;
    try { let body = ''; for await (const chunk of req) body += chunk; input = JSON.parse(body); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (typeof input.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
    if (!getTask.get(taskId, projectId)) return sendJson(res, 404, { error: 'Task not found' });
    updateTask.run(input.completed ? 1 : 0, taskId, projectId);
    return sendJson(res, 200, { ok: true });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });

  const filename = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname) ? 'index.html' : url.pathname === '/app.js' ? 'app.js' : url.pathname === '/styles.css' ? 'styles.css' : null;
  if (filename) {
    try {
      const content = await readFile(path.join(webRoot, filename));
      const type = filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(content);
    } catch { return sendJson(res, 500, { error: 'Unable to load application' }); }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
