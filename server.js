import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeDueDate } from './due-date.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
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
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
// Existing databases predate archive support; migrate without changing IDs or tasks.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Preserve existing task data while assigning the default priority.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults apply only to future tasks, never to existing task priorities.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'defaultTaskPriority')) {
  database.exec("ALTER TABLE projects ADD COLUMN defaultTaskPriority TEXT NOT NULL DEFAULT 'Normal' CHECK (defaultTaskPriority IN ('Low', 'Normal', 'High'))");
}
// Empty dates represent tasks without a scheduled calendar day.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'dueDate')) {
  database.exec("ALTER TABLE tasks ADD COLUMN dueDate TEXT NOT NULL DEFAULT ''");
}
// Preserve the current order from databases created before movement support.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Remember positions even while tasks are away. Seed legacy current positions only.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const projectQuery = `SELECT p.id, p.name, p.archived, p.defaultTaskPriority,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id`;
const listProjects = database.prepare(`${projectQuery} GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare(`${projectQuery} WHERE p.id = ? GROUP BY p.id`);
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, dueDate FROM tasks WHERE project_id = ? ORDER BY position, id');
const getTask = database.prepare('SELECT id, title, completed, priority, dueDate FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const nextTaskPosition = database.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position
  FROM task_project_positions WHERE project_id = ?`);
const rememberedPosition = database.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const rememberPosition = database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const moveTask = database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE project_id = ? AND id = ?');

// Keep the current position and its durable history consistent on every write.
function transaction(operation) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  return transaction(() => {
    const position = nextTaskPosition.get(projectId).position;
    const taskId = Number(insertTask.run(projectId, title, priority, position).lastInsertRowid);
    rememberPosition.run(taskId, projectId, position);
    return taskId;
  });
}

function relocateTask(taskId, sourceId, destinationId) {
  transaction(() => {
    let position = rememberedPosition.get(taskId, destinationId)?.position;
    if (position === undefined) {
      position = nextTaskPosition.get(destinationId).position;
      rememberPosition.run(taskId, destinationId, position);
    }
    moveTask.run(destinationId, position, sourceId, taskId);
  });
}
const setDefaultTaskPriority = database.prepare('UPDATE projects SET defaultTaskPriority = ? WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setTaskDueDate = database.prepare('UPDATE tasks SET dueDate = ? WHERE project_id = ? AND id = ?');

function projectJson(project) {
  return { ...project, archived: Boolean(project.archived) };
}

function taskJson(task) {
  return { ...task, completed: Boolean(task.completed) };
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./due-date.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
      const error = new Error('Request body is too large');
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

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') return json(response, 200, { status: 'ok' });
    if (path === '/api/projects') {
      if (request.method === 'GET') return json(response, 200, listProjects.all().map(projectJson));
      if (request.method === 'POST') {
        const input = await readJson(request);
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        const result = insertProject.run(name);
        return json(response, 201, projectJson(getProject.get(Number(result.lastInsertRowid))));
      }
    }
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const projectId = Number(taskMatch[1]);
      const taskId = taskMatch[2] ? Number(taskMatch[2]) : null;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project cannot be changed' });
      }
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (request.method === 'POST' && taskId === null) {
        const input = await readJson(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const taskId = createTask(projectId, title, getProject.get(projectId).defaultTaskPriority);
        return json(response, 201, taskJson(getTask.get(projectId, taskId)));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (input && Object.hasOwn(input, 'destinationProjectId')) {
          const destinationId = input.destinationProjectId;
          if (!Number.isSafeInteger(destinationId) || destinationId === projectId) {
            return json(response, 400, { error: 'Select another active destination project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived || getProject.get(projectId).archived) {
            return json(response, 409, { error: 'Archived projects cannot move tasks' });
          }
          relocateTask(taskId, projectId, destinationId);
          return json(response, 200, taskJson(getTask.get(destinationId, taskId)));
        } else if (input && Object.hasOwn(input, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
        } else if (input && Object.hasOwn(input, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          setTaskPriority.run(input.priority, projectId, taskId);
        } else if (input && Object.hasOwn(input, 'dueDate')) {
          const dueDate = normalizeDueDate(input.dueDate);
          if (dueDate === null) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setTaskDueDate.run(dueDate, projectId, taskId);
        } else {
          if (typeof input?.completed !== 'boolean') {
            return json(response, 400, { error: 'Completed must be a boolean' });
          }
          updateTask.run(Number(input.completed), projectId, taskId);
        }
        return json(response, 200, taskJson(getTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch) {
      const projectId = Number(projectMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET') return json(response, 200, projectJson(project));
      if (request.method === 'PATCH') {
        const input = await readJson(request);
        if (input && Object.hasOwn(input, 'name')) {
          if (project.archived) {
            return json(response, 409, { error: 'Archived project cannot be changed' });
          }
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          renameProject.run(name, projectId);
        } else if (input && Object.hasOwn(input, 'defaultTaskPriority')) {
          if (project.archived) {
            return json(response, 409, { error: 'Archived project cannot be changed' });
          }
          if (!['Low', 'Normal', 'High'].includes(input.defaultTaskPriority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          setDefaultTaskPriority.run(input.defaultTaskPriority, projectId);
        } else {
          if (typeof input?.archived !== 'boolean') {
            return json(response, 400, { error: 'Archived must be a boolean' });
          }
          setProjectArchived.run(Number(input.archived), projectId);
        }
        return json(response, 200, projectJson(getProject.get(projectId)));
      }
    }
    const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
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
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
