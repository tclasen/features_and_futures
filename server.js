import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const assets = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return sendJson(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/projects') return sendJson(res, 200, listProjects.all());
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const [, projectId, taskId] = taskMatch;
      if (!findProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) return sendJson(res, 200, listTasks.all(projectId).map(taskData));
      if (req.method === 'POST' && !taskId) {
        const input = await readJson(req);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return sendJson(res, 201, taskData(findTask.get(projectId, result.lastInsertRowid)));
      }
      if (req.method === 'PATCH' && taskId) {
        if (!findTask.get(projectId, taskId)) return sendJson(res, 404, { error: 'Task not found' });
        const input = await readJson(req);
        if (typeof input?.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return sendJson(res, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      return sendJson(res, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const input = await readJson(req);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(res, 201, findProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET' && assets.has(path)) {
      const [type, body] = assets.get(path);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(body);
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return sendJson(res, error.status, { error: error.message });
    console.error(error);
    sendJson(res, 500, { error: 'Unable to complete request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
