import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(root, 'data/workboard.sqlite');
mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const getTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function taskResponse(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const staticFiles = new Map([
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
]);

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && pathname === '/api/projects') {
      return json(res, 200, listProjects.all());
    }
    if (req.method === 'POST' && pathname === '/api/projects') {
      const input = await readJson(req);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : undefined;
      if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && taskId === undefined) {
        return json(res, 200, listTasks.all(projectId).map(taskResponse));
      }
      if (req.method === 'POST' && taskId === undefined) {
        const input = await readJson(req);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return json(res, 201, taskResponse(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (req.method === 'PATCH' && taskId !== undefined) {
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const input = await readJson(req);
        if (typeof input?.completed !== 'boolean') {
          return json(res, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskResponse(getTask.get(projectId, taskId)));
      }
    }
    const match = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(Number(match[1]));
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'GET' && (pathname === '/' || /^\/projects\/\d+$/.test(pathname))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(resolve(root, 'public/index.html')));
    }
    if (req.method === 'GET' && staticFiles.has(pathname)) {
      const [file, type] = staticFiles.get(pathname);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(readFileSync(resolve(root, file)));
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(res, error.status, { error: error.message });
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
