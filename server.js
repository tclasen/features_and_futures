import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validDueDate } from './public/dates.js';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
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
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep positions even while a task belongs to another project. Seed existing
// tasks from their previous ordering column without replacing remembered slots.
database.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;
`);
const projectSelect = `
  SELECT projects.id, projects.name, projects.archived, projects.default_task_priority,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
`;
const listProjects = database.prepare(`${projectSelect} GROUP BY projects.id ORDER BY projects.id`);
const getProject = database.prepare(`${projectSelect} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare(`SELECT tasks.id, tasks.project_id, title, completed, priority, due_date
  FROM tasks JOIN task_positions ON task_positions.task_id = tasks.id
    AND task_positions.project_id = tasks.project_id
  WHERE tasks.project_id = ? ORDER BY task_positions.position, tasks.id`);
const getTask = database.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const createTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const rememberTaskPosition = database.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?
  ON CONFLICT (task_id, project_id) DO NOTHING`);
const moveTask = database.prepare('UPDATE tasks SET project_id = ? WHERE project_id = ? AND id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/dates.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/dates.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function sendJson(response, status, body) {
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
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function taskJson(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function transaction(action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return sendJson(response, 200, listProjects.all());
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return sendJson(response, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(response, 201, getProject.get(result.lastInsertRowid));
    }
    if (request.method === 'PATCH' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      if (Object.hasOwn(input || {}, 'default_task_priority')) {
        if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_task_priority)) {
          return sendJson(response, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        updateProjectDefault.run(input.default_task_priority, project.id);
        return sendJson(response, 200, getProject.get(project.id));
      }
      if (Object.hasOwn(input || {}, 'name')) {
        if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        renameProject.run(name, project.id);
        return sendJson(response, 200, getProject.get(project.id));
      }
      if (typeof input?.archived !== 'boolean') {
        return sendJson(response, 400, { error: 'Archive state must be a boolean' });
      }
      updateProject.run(Number(input.archived), projectMatch[1]);
      return sendJson(response, 200, getProject.get(projectMatch[1]));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = getProject.get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (!taskId && request.method === 'GET') {
        return sendJson(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (!taskId && request.method === 'POST') {
        if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
        const input = await readJson(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = transaction(() => {
          const created = createTask.run(projectId, title, project.default_task_priority);
          rememberTaskPosition.run(created.lastInsertRowid, projectId, projectId);
          return created;
        });
        return sendJson(response, 201, taskJson(getTask.get(projectId, result.lastInsertRowid)));
      }
      if (taskId && request.method === 'PATCH') {
        if (!getTask.get(projectId, taskId)) return sendJson(response, 404, { error: 'Task not found' });
        if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
        const input = await readJson(request);
        if (Object.hasOwn(input || {}, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId === project.id) {
            return sendJson(response, 400, { error: 'Choose another active project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return sendJson(response, 404, { error: 'Destination project not found' });
          if (destination.archived) return sendJson(response, 409, { error: 'Archived project' });
          transaction(() => {
            rememberTaskPosition.run(taskId, destinationId, destinationId);
            moveTask.run(destinationId, projectId, taskId);
          });
          return sendJson(response, 200, taskJson(getTask.get(destinationId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'due_date')) {
          const dueDate = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (dueDate === null || !validDueDate(dueDate)) {
            return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateTaskDueDate.run(dueDate, projectId, taskId);
          return sendJson(response, 200, taskJson(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return sendJson(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updateTaskPriority.run(input.priority, projectId, taskId);
          return sendJson(response, 200, taskJson(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return sendJson(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return sendJson(response, 200, taskJson(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') {
          return sendJson(response, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return sendJson(response, 200, taskJson(getTask.get(projectId, taskId)));
      }
    }
    const asset = assets.get(path) || (/^\/projects\/\d+$/.test(path) ? assets.get('/') : null);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return sendJson(response, error.status, { error: error.message });
    console.error(error);
    sendJson(response, 500, { error: 'Unable to complete request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
