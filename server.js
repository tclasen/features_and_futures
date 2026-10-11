import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const projectQuery = `SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id`;
const listProjects = db.prepare(`${projectQuery} GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ? GROUP BY p.id`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const projectJSON = (project) => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJSON = (task) => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);
const html = readFileSync(new URL('./public/index.html', import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJSON(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && pathname === '/api/projects') return json(response, 200, listProjects.all().map(projectJSON));
    if (request.method === 'POST' && pathname === '/api/projects') {
      const input = await readJSON(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectJSON(getProject.get(Number(result.lastInsertRowid))));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (request.method === 'POST' && taskId === null) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        const input = await readJSON(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(response, 201, taskJSON(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJSON(request);
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    const match = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (match && (request.method === 'GET' || request.method === 'PATCH')) {
      const projectId = Number(match[1]);
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'PATCH') {
        const input = await readJSON(request);
        if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
        updateProject.run(Number(input.archived), projectId);
      }
      return json(response, 200, projectJSON(getProject.get(projectId)));
    }
    if (request.method === 'GET' && assets.has(pathname)) {
      const [type, contents] = assets.get(pathname);
      response.writeHead(200, { 'Content-Type': type });
      return response.end(contents);
    }
    if (request.method === 'GET' && (pathname === '/' || /^\/projects\/\d+$/.test(pathname))) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(html);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    json(response, 500, { error: 'Unable to complete request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
