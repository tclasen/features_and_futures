import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
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
// Upgrade databases created before archive support without losing projects or tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const projectSelection = `SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = db.prepare(projectSelection + ' GROUP BY projects.id ORDER BY projects.id');
const findProject = db.prepare(projectSelection + ' WHERE projects.id = ? GROUP BY projects.id');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const page = readFileSync(new URL('./public/index.html', import.meta.url));

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'GET' && path === '/health') {
    return json(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && path === '/api/projects') {
    return json(response, 200, listProjects.all());
  }
  const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(projectMatch[1]);
    return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'POST' && path === '/api/projects') {
    try {
      const input = await readBody(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, findProject.get(Number(result.lastInsertRowid)));
    } catch (error) {
      return json(response, error.status || 400, { error: error.status ? error.message : 'Unable to create project' });
    }
  }
  if (request.method === 'PATCH' && projectMatch) {
    try {
      const input = await readBody(request);
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
      const result = archiveProject.run(Number(input.archived), projectMatch[1]);
      if (!result.changes) return json(response, 404, { error: 'Project not found' });
      return json(response, 200, findProject.get(projectMatch[1]));
    } catch (error) {
      return json(response, error.status || 400, { error: error.status ? error.message : 'Unable to save project' });
    }
  }
  const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const [, projectId, taskId] = tasksMatch;
    const project = findProject.get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (request.method === 'GET' && !taskId) {
      return json(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if ((request.method === 'POST' && !taskId) || (request.method === 'PATCH' && taskId)) {
      try {
        const input = await readBody(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (!taskId) {
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = createTask.run(projectId, title);
          return json(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
        }
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        const result = updateTask.run(Number(input.completed), projectId, taskId);
        if (!result.changes) return json(response, 404, { error: 'Task not found' });
        return json(response, 200, { id: Number(taskId), completed: input.completed });
      } catch (error) {
        return json(response, error.status || 400, { error: error.status ? error.message : 'Unable to save task' });
      }
    }
  }
  if (request.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  json(response, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
