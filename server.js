import http from 'node:http';
import { normalizeDueDate } from './due-dates.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(title) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
// Upgrade databases created before project archiving was introduced.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive the same priority default as newly created tasks.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Upgrade existing projects without changing any saved task priorities.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
// An empty string represents an optional, unset calendar date.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Preserve legacy creation order and allow moved tasks to append without changing identity.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;`);
}
const projectSelection = `SELECT id, name, archived, default_task_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND completed = 1) AS completed
  FROM projects`;
const listProjects = database.prepare(`${projectSelection} ORDER BY id`);
const findProject = database.prepare(`${projectSelection} WHERE id = ?`);
const archiveProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const findTask = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const createTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE project_id = ? AND id = ?`);
const setDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');

const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');

function taskData(task) {
  return { ...task, completed: Boolean(task.completed) };
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/task-filters.js', ['task-filters.js', 'text/javascript; charset=utf-8']],
  ['/due-dates.js', ['due-dates.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request is too large');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects') {
      if (request.method === 'GET') return json(response, 200, listProjects.all());
      if (request.method === 'POST') {
        const input = await readJson(request);
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        const result = createProject.run(name);
        return json(response, 201, findProject.get(Number(result.lastInsertRowid)));
      }
    }
    const moveMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
    if (moveMatch && request.method === 'POST') {
      const projectId = Number(moveMatch[1]);
      const taskId = Number(moveMatch[2]);
      const input = await readJson(request);
      const source = findProject.get(projectId);
      if (!source) return json(response, 404, { error: 'Project not found' });
      if (source.archived) return json(response, 409, { error: 'Archived project is read-only' });
      if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
      const destinationId = input?.destination_project_id;
      if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === projectId) {
        return json(response, 400, { error: 'Choose another active destination project' });
      }
      const destination = findProject.get(destinationId);
      if (!destination) return json(response, 404, { error: 'Destination project not found' });
      if (destination.archived) return json(response, 409, { error: 'Destination project is archived' });
      // One synchronous statement atomically transfers ownership and appends to the destination.
      moveTask.run(destinationId, destinationId, projectId, taskId);
      return json(response, 200, taskData(findTask.get(destinationId, taskId)));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project is read-only' });
      }
      if (!tasksMatch[2]) {
        if (request.method === 'GET') return json(response, 200, listTasks.all(projectId).map(taskData));
        if (request.method === 'POST') {
          const input = await readJson(request);
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = createTask.run(projectId, title, project.default_task_priority, projectId);
          return json(response, 201, taskData(findTask.get(projectId, Number(result.lastInsertRowid))));
        }
      } else if (request.method === 'PATCH') {
        const taskId = Number(tasksMatch[2]);
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (input && Object.hasOwn(input, 'due_date')) {
          if (['title', 'completed', 'priority'].some((key) => Object.hasOwn(input, key))) {
            return json(response, 400, { error: 'Due date must be a separate update' });
          }
          const date = normalizeDueDate(input.due_date);
          if (date === null) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setTaskDueDate.run(date, projectId, taskId);
        } else if (input && Object.hasOwn(input, 'priority')) {
          if (Object.hasOwn(input, 'title') || Object.hasOwn(input, 'completed')) {
            return json(response, 400, { error: 'Priority must be a separate update' });
          }
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          setTaskPriority.run(input.priority, projectId, taskId);
        } else if (input && Object.hasOwn(input, 'title')) {
          if (Object.hasOwn(input, 'completed')) {
            return json(response, 400, { error: 'Rename and completion must be separate updates' });
          }
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
        } else {
          if (typeof input?.completed !== 'boolean') {
            return json(response, 400, { error: 'Completed must be a boolean' });
          }
          updateTask.run(Number(input.completed), projectId, taskId);
        }
        return json(response, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch) {
      const projectId = Number(projectMatch[1]);
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET') return json(response, 200, project);
      if (request.method === 'PATCH') {
        const input = await readJson(request);
        if (input && Object.hasOwn(input, 'default_task_priority')) {
          if (Object.hasOwn(input, 'name') || Object.hasOwn(input, 'archived')) {
            return json(response, 400, { error: 'Default priority must be a separate update' });
          }
          if (project.archived) return json(response, 409, { error: 'Archived project is read-only' });
          if (!['Low', 'Normal', 'High'].includes(input.default_task_priority)) {
            return json(response, 400, { error: 'Default priority must be Low, Normal, or High' });
          }
          setDefaultTaskPriority.run(input.default_task_priority, projectId);
        } else if (input && Object.hasOwn(input, 'name')) {
          if (Object.hasOwn(input, 'archived')) {
            return json(response, 400, { error: 'Rename and archive must be separate updates' });
          }
          if (project.archived) return json(response, 409, { error: 'Archived project is read-only' });
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          renameProject.run(name, projectId);
        } else {
          if (typeof input?.archived !== 'boolean') {
            return json(response, 400, { error: 'Archived must be a boolean' });
          }
          archiveProject.run(Number(input.archived), projectId);
        }
        return json(response, 200, findProject.get(projectId));
      }
    }
    if (request.method === 'GET') {
      const asset = /^\/projects\/\d+$/.test(pathname) ? assets.get('/') : assets.get(pathname);
      if (asset) {
        const content = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': asset[1] });
        return response.end(content);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
