import { validDueDate } from './public/date.js';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
  `);
}
// Keep each project's established positions even while its tasks are elsewhere.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const projectQuery = `SELECT id, name, archived, default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND completed = 1) AS completed
  FROM projects`;
const listProjects = database.prepare(`${projectQuery} ORDER BY id`);
const getProject = database.prepare(`${projectQuery} WHERE id = ?`);
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date, notes FROM tasks WHERE project_id = ? ORDER BY position, id');
const getTask = database.prepare('SELECT id, title, completed, priority, due_date, notes FROM tasks WHERE project_id = ? AND id = ?');
const createTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const rememberCreatedTask = database.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
const rememberDestination = database.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const moveTask = database.prepare(`UPDATE tasks
  SET position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?), project_id = ?
  WHERE project_id = ? AND id = ?`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');

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

function taskData(task) {
  return { ...task, completed: Boolean(task.completed) };
}

async function readInput(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const assets = new Map([
  ['/date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/date.js', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all());
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readInput(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if (request.method === 'POST' && taskId === null) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        const input = await readInput(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const taskId = transaction(() => {
          const result = createTask.run(projectId, title, project.default_priority, projectId);
          rememberCreatedTask.run(result.lastInsertRowid);
          return Number(result.lastInsertRowid);
        });
        return json(response, 201, taskData(getTask.get(projectId, taskId)));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readInput(request);
        if (Object.hasOwn(input ?? {}, 'notes')) {
          if (typeof input.notes !== 'string') return json(response, 400, { error: 'Notes must be text' });
          updateTaskNotes.run(input.notes, projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === projectId) {
            return json(response, 400, { error: 'Choose another active destination project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(response, 409, { error: 'Archived project' });
          transaction(() => {
            rememberDestination.run(taskId, destinationId, destinationId);
            moveTask.run(taskId, destinationId, destinationId, projectId, taskId);
          });
          return json(response, 200, taskData(getTask.get(destinationId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'due_date')) {
          const dueDate = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (dueDate === null || !validDueDate(dueDate)) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateTaskDueDate.run(dueDate, projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updateTaskPriority.run(input.priority, projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completed must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskData(getTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(Number(projectMatch[1]));
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = Number(projectMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      const input = await readInput(request);
      if (Object.hasOwn(input ?? {}, 'default_priority')) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        updateDefaultPriority.run(input.default_priority, projectId);
        return json(response, 200, getProject.get(projectId));
      }
      if (Object.hasOwn(input ?? {}, 'name')) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectId);
        return json(response, 200, getProject.get(projectId));
      }
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archived must be a boolean' });
      updateProject.run(Number(input.archived), projectId);
      return json(response, 200, getProject.get(projectId));
    }
    if (request.method === 'GET' && assets.has(path)) {
      const [type, content] = assets.get(path);
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    }
    if (request.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    json(response, 500, { error: 'Unable to complete request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
