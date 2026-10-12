import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const projectSelect = `SELECT projects.id, projects.name, projects.archived, projects.default_priority,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = db.prepare(`${projectSelect} GROUP BY projects.id ORDER BY projects.id`);
const getProject = db.prepare(`${projectSelect} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectJSON = (project) => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const taskJSON = (task) => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function readJSON(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && path === '/api/projects') return json(response, 200, listProjects.all().map(projectJSON));
    const projectApi = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectApi) {
      const project = getProject.get(projectApi[1]);
      return json(response, project ? 200 : 404, project ? projectJSON(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectApi) {
      if (!getProject.get(projectApi[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readJSON(request);
      if (Object.hasOwn(input ?? {}, 'default_priority')) {
        if (getProject.get(projectApi[1]).archived) return json(response, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
        }
        setDefaultPriority.run(input.default_priority, projectApi[1]);
        return json(response, 200, projectJSON(getProject.get(projectApi[1])));
      }
      if (Object.hasOwn(input ?? {}, 'name')) {
        if (getProject.get(projectApi[1]).archived) return json(response, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectApi[1]);
        return json(response, 200, projectJSON(getProject.get(projectApi[1])));
      }
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), projectApi[1]);
      return json(response, 200, projectJSON(getProject.get(projectApi[1])));
    }
    const tasksApi = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksApi) {
      const [, projectId, taskId] = tasksApi;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (request.method === 'POST' && !taskId) {
        const input = await readJSON(request);
        const currentProject = getProject.get(projectId);
        if (currentProject.archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title, currentProject.default_priority);
        return json(response, 201, taskJSON(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId) {
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJSON(request);
        if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (Object.hasOwn(input ?? {}, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || !validDueDate(date)) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setDueDate.run(date, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Task priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJSON(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, projectJSON(getProject.get(Number(result.lastInsertRowid))));
    }
    const asset = assets.get(path) || (/^\/projects\/\d+$/.test(path) ? assets.get('/') : null);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
