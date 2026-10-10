import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
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
const getTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJSON = task => ({ ...task, completed: Boolean(task.completed) });
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readInput(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) {
      json(res, 413, { error: 'Request too large' });
      return;
    }
  }
  try { return JSON.parse(body); }
  catch { json(res, 400, { error: 'Invalid JSON' }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && path === '/api/projects') {
      return json(res, 200, listProjects.all());
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const input = await readInput(req, res);
      if (res.writableEnded) return;
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const projectId = Number(taskMatch[1]);
      if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (!taskMatch[2] && req.method === 'GET') {
        return json(res, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (!taskMatch[2] && req.method === 'POST') {
        const input = await readInput(req, res);
        if (res.writableEnded) return;
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return json(res, 201, taskJSON(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (taskMatch[2] && req.method === 'PATCH') {
        const taskId = Number(taskMatch[2]);
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const input = await readInput(req, res);
        if (res.writableEnded) return;
        if (typeof input?.completed !== 'boolean') return json(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    const apiMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && apiMatch) {
      const project = getProject.get(Number(apiMatch[1]));
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'An unexpected error occurred' });
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
