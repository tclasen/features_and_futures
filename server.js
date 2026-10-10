import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
db.exec('PRAGMA foreign_keys = ON');
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const projectQuery = `SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id`;
const listProjects = db.prepare(`${projectQuery} GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ? GROUP BY p.id`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJson = (task) => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readInput(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      json(res, 413, { error: 'Request too large' });
      return;
    }
  }
  try { return JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON' }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && pathname === '/api/projects') return json(res, 200, listProjects.all());
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return json(res, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (req.method === 'POST' && pathname === '/api/projects') {
      const input = await readInput(req, res);
      if (res.writableEnded) return;
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(result.lastInsertRowid));
    }
    if (req.method === 'PATCH' && projectMatch) {
      const id = projectMatch[1];
      if (!getProject.get(id)) return json(res, 404, { error: 'Project not found' });
      const input = await readInput(req, res);
      if (res.writableEnded) return;
      if (typeof input?.archived !== 'boolean') return json(res, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), id);
      return json(res, 200, getProject.get(id));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (tasksMatch && ['GET', 'POST'].includes(req.method)) {
      const projectId = tasksMatch[1];
      if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET') return json(res, 200, listTasks.all(projectId).map(taskJson));
      const input = await readInput(req, res);
      if (res.writableEnded) return;
      if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project' });
      const title = typeof input?.title === 'string' ? input.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const result = createTask.run(projectId, title);
      return json(res, 201, taskJson(getTask.get(projectId, result.lastInsertRowid)));
    }
    const taskMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
    if (req.method === 'PATCH' && taskMatch) {
      const [, projectId, taskId] = taskMatch;
      if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
      const input = await readInput(req, res);
      if (res.writableEnded) return;
      if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project' });
      if (typeof input?.completed !== 'boolean') return json(res, 400, { error: 'Completion must be a boolean' });
      updateTask.run(Number(input.completed), projectId, taskId);
      return json(res, 200, taskJson(getTask.get(projectId, taskId)));
    }
    if (req.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(pathname) ? '/' : pathname);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-cache' });
        return res.end(asset[1]);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Unable to complete request' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
