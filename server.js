import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || resolve('data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const projectQuery = `SELECT projects.id, projects.name, projects.archived, projects.default_task_priority,
  COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = db.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
const findProject = db.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = db.prepare('UPDATE projects SET name = ?, archived = ?, default_task_priority = ? WHERE id = ?');
const projectJson = (project) => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET title = ?, completed = ?, priority = ?, due_date = ? WHERE project_id = ? AND id = ?');
const taskJson = (task) => ({ ...task, completed: Boolean(task.completed) });

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
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

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectJson));
    }
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      return json(response, project ? 200 : 404, project ? projectJson(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && match) {
      if (!findProject.get(match[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      const project = findProject.get(match[1]);
      const renaming = Object.hasOwn(input ?? {}, 'name');
      const archiving = Object.hasOwn(input ?? {}, 'archived');
      const changingDefault = Object.hasOwn(input ?? {}, 'default_task_priority');
      if ((renaming || changingDefault) && project.archived) {
        return json(response, 409, { error: 'Archived project' });
      }
      const name = renaming && typeof input.name === 'string' ? input.name.trim() : '';
      if (renaming && !name) {
        return json(response, 400, { error: 'Project name is required' });
      }
      if ((!renaming && !archiving && !changingDefault) || (archiving && typeof input.archived !== 'boolean')) {
        return json(response, 400, { error: 'Archive state must be a boolean' });
      }
      if (changingDefault && !['Low', 'Normal', 'High'].includes(input.default_task_priority)) {
        return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
      }
      updateProject.run(renaming ? name : project.name,
        archiving ? Number(input.archived) : project.archived,
        changingDefault ? input.default_task_priority : project.default_task_priority, match[1]);
      return json(response, 200, projectJson(findProject.get(match[1])));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project' });
      }
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (request.method === 'POST' && !taskId) {
        const input = await readJson(request);
        const currentProject = findProject.get(projectId);
        if (currentProject.archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title, currentProject.default_task_priority);
        return json(response, 201, taskJson(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId) {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const task = findTask.get(projectId, taskId);
        const renaming = Object.hasOwn(input ?? {}, 'title');
        const completing = Object.hasOwn(input ?? {}, 'completed');
        const prioritizing = Object.hasOwn(input ?? {}, 'priority');
        const dating = Object.hasOwn(input ?? {}, 'due_date');
        const dueDate = dating && typeof input.due_date === 'string' ? input.due_date.trim() : '';
        if (dating && (typeof input.due_date !== 'string' || (dueDate && !validDueDate(dueDate)))) {
          return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
        const title = renaming && typeof input.title === 'string' ? input.title.trim() : '';
        if (renaming && !title) {
          return json(response, 400, { error: 'Task title is required' });
        }
        if ((!renaming && !completing && !prioritizing && !dating) || (completing && typeof input.completed !== 'boolean')) {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        if (prioritizing && !['Low', 'Normal', 'High'].includes(input.priority)) {
          return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        updateTask.run(renaming ? title : task.title,
          completing ? Number(input.completed) : task.completed,
          prioritizing ? input.priority : task.priority,
          dating ? dueDate : task.due_date, projectId, taskId);
        return json(response, 200, taskJson(findTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectJson(findProject.get(Number(result.lastInsertRowid))));
    }
    const asset = assets.get(path) || (/^\/projects\/\d+$/.test(path) ? assets.get('/') : undefined);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Something went wrong' });
    else response.end();
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
