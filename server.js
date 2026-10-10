import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeDueDate } from './due-date.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0)
)`);
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_by_project ON tasks(project_id, id)`);
// Existing databases retain their projects and tasks when archive support is added.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
// Adding a default also initializes existing tasks without changing their identity.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Preserve the current order when upgrading databases that predate task movement.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT`);
}
// Positions remain reserved even while a task belongs to another project.
// Seed only current ownership: earlier moves cannot be reconstructed from old databases.
database.exec(`BEGIN;
  CREATE TABLE IF NOT EXISTS task_positions (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (project_id, task_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (project_id, task_id, position)
    SELECT project_id, id, position FROM tasks;
  COMMIT`);

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

const rememberPosition = database.prepare(`INSERT INTO task_positions (project_id, task_id, position)
  VALUES (?, ?, ?) ON CONFLICT (project_id, task_id) DO NOTHING`);
const nextPosition = database.prepare(`SELECT coalesce(max(position), 0) + 1 AS position
  FROM task_positions WHERE project_id = ?`);
const savedPosition = database.prepare('SELECT position FROM task_positions WHERE project_id = ? AND task_id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const findTask = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, ?)`);
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?, position = ?
  WHERE project_id = ? AND id = ?`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });
const projectQuery = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT count(*) FROM tasks WHERE project_id = p.id) AS total,
  (SELECT count(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
  FROM projects p`;
const listProjects = database.prepare(`${projectQuery} ORDER BY p.id`);
const findProject = database.prepare(`${projectQuery} WHERE p.id = ?`);
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectData = project => ({ ...project, archived: Boolean(project.archived) });

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

const assets = new Map([
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/due-date.js', ['due-date.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
]);

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectData(findProject.get(Number(result.lastInsertRowid))));
    }
    const tasksMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if (request.method === 'POST' && taskId === null) {
        const input = await readJson(request);
        const currentProject = findProject.get(projectId);
        if (currentProject.archived) {
          return json(response, 409, { error: 'Archived project is read-only' });
        }
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = transaction(() => {
          const position = nextPosition.get(projectId).position;
          const inserted = insertTask.run(projectId, title, currentProject.default_priority, position);
          rememberPosition.run(projectId, inserted.lastInsertRowid, position);
          return inserted;
        });
        return json(response, 201, taskData(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (findProject.get(projectId).archived) {
          return json(response, 409, { error: 'Archived project is read-only' });
        }
        const changes = ['title', 'completed', 'priority', 'due_date', 'destination_project_id'].filter(key => input && Object.hasOwn(input, key));
        if (changes.length > 1) {
          return json(response, 400, { error: 'Task changes must be separate requests' });
        }
        if (changes[0] === 'destination_project_id') {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === projectId) {
            return json(response, 400, { error: 'Choose another active destination project' });
          }
          const destination = findProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived) {
            return json(response, 409, { error: 'Destination project is archived' });
          }
          // Reuse a remembered slot, or reserve a new one after all established slots.
          // Ownership and position history must commit together.
          transaction(() => {
            const position = savedPosition.get(destinationId, taskId)?.position
              ?? nextPosition.get(destinationId).position;
            rememberPosition.run(destinationId, taskId, position);
            moveTask.run(destinationId, position, projectId, taskId);
          });
          return json(response, 200, taskData(findTask.get(destinationId, taskId)));
        } else if (changes[0] === 'due_date') {
          const dueDate = normalizeDueDate(input.due_date);
          if (dueDate === null) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateDueDate.run(dueDate, projectId, taskId);
        } else if (changes[0] === 'priority') {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, projectId, taskId);
        } else if (changes[0] === 'title') {
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
    const projectMatch = path.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (projectMatch && ['GET', 'PATCH'].includes(request.method)) {
      const projectId = Number(projectMatch[1]);
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'PATCH') {
        const input = await readJson(request);
        const changes = ['name', 'archived', 'default_priority'].filter(key => input && Object.hasOwn(input, key));
        if (changes.length > 1) {
          return json(response, 400, { error: 'Project changes must be separate requests' });
        }
        if (changes[0] === 'default_priority') {
          if (findProject.get(projectId).archived) {
            return json(response, 409, { error: 'Archived project is read-only' });
          }
          if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updateDefaultPriority.run(input.default_priority, projectId);
        } else if (changes[0] === 'name') {
          if (findProject.get(projectId).archived) {
            return json(response, 409, { error: 'Archived project is read-only' });
          }
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          renameProject.run(name, projectId);
        } else {
          if (typeof input?.archived !== 'boolean') {
            return json(response, 400, { error: 'Archived must be a boolean' });
          }
          updateProject.run(Number(input.archived), projectId);
        }
      }
      return json(response, 200, projectData(findProject.get(projectId)));
    }
    if (request.method === 'GET') {
      const asset = path === '/' || /^\/projects\/[1-9]\d*$/.test(path)
        ? ['public/index.html', 'text/html; charset=utf-8']
        : assets.get(path);
      if (asset) {
        const content = await readFile(new URL(asset[0], import.meta.url));
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

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
