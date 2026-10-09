import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });
const html = readFileSync(new URL('./public/index.html', import.meta.url));

async function readInput(req) {
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

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && path === '/api/projects') {
      return json(res, 200, listProjects.all());
    }
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const [, projectId, taskId] = taskMatch;
      if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) {
        return json(res, 200, listTasks.all(projectId).map(taskData));
      }
      if (req.method === 'POST' && !taskId) {
        const input = await readInput(req);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(res, 201, taskData(getTask.get(projectId, result.lastInsertRowid)));
      }
      if (req.method === 'PATCH' && taskId) {
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const input = await readInput(req);
        if (typeof input?.completed !== 'boolean') {
          return json(res, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskData(getTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const input = await readInput(req);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(res, 201, getProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
