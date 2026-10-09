import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && req.method === 'GET') {
      return json(res, 200, listProjects.all());
    }
    if (path === '/api/projects' && req.method === 'POST') {
      const data = await readBody(req);
      const name = typeof data?.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(res, 201, findProject.get(Number(result.lastInsertRowid)));
    }
    const apiProject = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && apiProject) {
      const project = findProject.get(Number(apiProject[1]));
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    const taskRoute = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskRoute) {
      const projectId = Number(taskRoute[1]);
      const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
      if (!findProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && taskId === null) {
        return json(res, 200, listTasks.all(projectId).map(taskData));
      }
      if (req.method === 'POST' && taskId === null) {
        const data = await readBody(req);
        const title = typeof data?.title === 'string' ? data.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(res, 201, taskData(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (req.method === 'PATCH' && taskId !== null) {
        if (!findTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const data = await readBody(req);
        if (typeof data?.completed !== 'boolean') return json(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(data.completed), projectId, taskId);
        return json(res, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'GET') {
      const asset = /^\/projects\/\d+$/.test(path) ? assets.get('/') : assets.get(path);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[1] });
        return res.end(readFileSync(join(root, 'public', asset[0])));
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(res, error.status, { error: error.message });
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'An unexpected error occurred' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
