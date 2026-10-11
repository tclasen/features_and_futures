import http from 'node:http';
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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, id)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
const projectQuery = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total_count,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed_count
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectValue = project => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const getTask = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE project_id = ? AND id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const taskValue = task => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(join(root, 'public', 'index.html'))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(join(root, 'public', 'app.js'))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(join(root, 'public', 'style.css'))]],
]);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

// Calendar arithmetic avoids JavaScript Date's timezone and small-year conversions.
function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function readInput(req) {
  let body = '';
  for await (const chunk of req) {
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

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && path === '/api/projects') {
      return json(res, 200, listProjects.all().map(projectValue));
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return json(res, project ? 200 : 404, project ? projectValue(project) : { error: 'Project not found' });
    }
    if (req.method === 'PATCH' && projectMatch) {
      if (!getProject.get(projectMatch[1])) return json(res, 404, { error: 'Project not found' });
      const input = await readInput(req);
      if (input && Object.hasOwn(input, 'default_priority')) {
        if (getProject.get(projectMatch[1]).archived) return json(res, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(res, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        updateDefaultPriority.run(input.default_priority, projectMatch[1]);
        return json(res, 200, projectValue(getProject.get(projectMatch[1])));
      }
      if (input && Object.hasOwn(input, 'name')) {
        if (getProject.get(projectMatch[1]).archived) return json(res, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(res, 400, { error: 'Project name is required' });
        renameProject.run(name, projectMatch[1]);
        return json(res, 200, projectValue(getProject.get(projectMatch[1])));
      }
      if (typeof input?.archived !== 'boolean') {
        return json(res, 400, { error: 'Archive state must be true or false' });
      }
      updateProject.run(Number(input.archived), projectMatch[1]);
      return json(res, 200, projectValue(getProject.get(projectMatch[1])));
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const input = await readInput(req);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(res, 201, projectValue(getProject.get(result.lastInsertRowid)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) {
        return json(res, 200, listTasks.all(projectId).map(taskValue));
      }
      if (req.method === 'POST' && !taskId) {
        const input = await readInput(req);
        if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title, getProject.get(projectId).default_priority, projectId);
        return json(res, 201, taskValue(getTask.get(projectId, result.lastInsertRowid)));
      }
      if (req.method === 'PATCH' && taskId) {
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        const input = await readInput(req);
        if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project' });
        if (input && Object.hasOwn(input, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId < 1 || destinationId === Number(projectId)) {
            return json(res, 400, { error: 'Choose another active project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return json(res, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(res, 409, { error: 'Archived project' });
          // One SQLite statement changes ownership and appends to destination order.
          moveTask.run(destinationId, destinationId, projectId, taskId);
          return json(res, 200, taskValue(getTask.get(destinationId, taskId)));
        }
        if (input && Object.hasOwn(input, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || (date !== '' && !validDueDate(date))) {
            return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateDueDate.run(date, projectId, taskId);
          return json(res, 200, taskValue(getTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(res, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updatePriority.run(input.priority, projectId, taskId);
          return json(res, 200, taskValue(getTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(res, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(res, 200, taskValue(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') {
          return json(res, 400, { error: 'Completion must be true or false' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskValue(getTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0] });
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

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
