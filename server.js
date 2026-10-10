import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(appDirectory, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const htmlPath = fileURLToPath(new URL('./public/index.html', import.meta.url));
const jsPath = fileURLToPath(new URL('./public/app.js', import.meta.url));
const cssPath = fileURLToPath(new URL('./public/style.css', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
async function bodyJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error('Request too large');
  }
  return JSON.parse(data || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ status: 'ok' }));
    if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, JSON.stringify(listProjects.all()));
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const data = await bodyJson(req);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = addProject.run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch && req.method === 'GET' && !taskMatch[2]) {
      const projectId = Number(taskMatch[1]);
      if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Not found' }));
      return send(res, 200, JSON.stringify(listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
    }
    if (taskMatch && req.method === 'POST' && !taskMatch[2]) {
      const projectId = Number(taskMatch[1]);
      if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Not found' }));
      const data = await bodyJson(req);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = addTask.run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
    }
    if (taskMatch && req.method === 'PATCH' && taskMatch[2]) {
      const projectId = Number(taskMatch[1]);
      const data = await bodyJson(req);
      if (typeof data.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = updateTask.run(data.completed ? 1 : 0, Number(taskMatch[2]), projectId);
      return result.changes ? send(res, 200, JSON.stringify({ ok: true })) : send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(Number(projectMatch[1]));
      return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      return send(res, 200, await readFile(htmlPath, 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, await readFile(jsPath, 'utf8'), 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/style.css') return send(res, 200, await readFile(cssPath, 'utf8'), 'text/css; charset=utf-8');
    send(res, 404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    send(res, error.message === 'Request too large' ? 413 : 400, JSON.stringify({ error: 'Invalid request' }));
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
