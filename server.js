import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
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
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
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
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
const listProjects = db.prepare(`SELECT projects.id, projects.name, projects.archived, projects.default_priority,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  GROUP BY projects.id ORDER BY projects.id`);
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const getTask = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE project_id = ? AND id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const taskData = (task) => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
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
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/projects') return json(res, 200, listProjects.all());
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      return json(res, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (req.method === 'PATCH' && match) {
      if (!getProject.get(match[1])) return json(res, 404, { error: 'Project not found' });
      const input = await readBody(req);
      if (Object.hasOwn(input || {}, 'default_priority')) {
        if (getProject.get(match[1]).archived) return json(res, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(res, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        setDefaultPriority.run(input.default_priority, match[1]);
        return json(res, 200, getProject.get(match[1]));
      }
      if (Object.hasOwn(input || {}, 'name')) {
        if (getProject.get(match[1]).archived) return json(res, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(res, 400, { error: 'Project name is required' });
        renameProject.run(name, match[1]);
        return json(res, 200, getProject.get(match[1]));
      }
      if (typeof input?.archived !== 'boolean') return json(res, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), match[1]);
      return json(res, 200, getProject.get(match[1]));
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const input = await readBody(req);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const [, projectId, taskId] = taskMatch;
      const project = getProject.get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) {
        return json(res, 200, listTasks.all(projectId).map(taskData));
      }
      if (req.method === 'POST' && !taskId) {
        const input = await readBody(req);
        const currentProject = getProject.get(projectId);
        if (currentProject.archived) return json(res, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title, currentProject.default_priority, projectId);
        return json(res, 201, taskData(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (req.method === 'PATCH' && taskId) {
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const input = await readBody(req);
        if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project' });
        if (Object.hasOwn(input || {}, 'project_id')) {
          if (!Number.isSafeInteger(input.project_id) || input.project_id < 1 || input.project_id === Number(projectId)) {
            return json(res, 400, { error: 'Choose another active destination project' });
          }
          const destination = getProject.get(input.project_id);
          if (!destination) return json(res, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(res, 409, { error: 'Archived project' });
          // Recheck ownership after reading the request body, in case another request moved it.
          if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
          moveTask.run(destination.id, destination.id, projectId, taskId);
          return json(res, 200, taskData(getTask.get(destination.id, taskId)));
        }
        if (Object.hasOwn(input || {}, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || (date !== '' && !validDueDate(date))) {
            return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setDueDate.run(date, projectId, taskId);
          return json(res, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(res, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, projectId, taskId);
          return json(res, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(res, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(res, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskData(getTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store' });
        return res.end(asset[1]);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(res, error.status, { error: error.message });
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
