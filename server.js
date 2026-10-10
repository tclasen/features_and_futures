import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeDueDate } from './due-date.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);
// Upgrade existing Task 001/002 databases without replacing their data.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
// Existing tasks receive the same default as new tasks.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Preserve legacy creation order, then append new and moved tasks per project.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;`);
}
const projectQuery = `SELECT projects.id, projects.name, projects.archived, projects.default_task_priority,
  COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = database.prepare('UPDATE projects SET archived = ?, name = ?, default_task_priority = ? WHERE id = ?');
function projectValue(project) {
  return { ...project, archived: Boolean(project.archived) };
}
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const findTask = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE project_id = ? AND id = ?`);
const updateTask = database.prepare('UPDATE tasks SET completed = ?, title = ?, priority = ?, due_date = ? WHERE project_id = ? AND id = ?');
function taskValue(task) {
  return { ...task, completed: Boolean(task.completed) };
}
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./due-date.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
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
    if (body.length > 65536) {
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
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') return json(response, 200, { status: 'ok' });
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all().map(projectValue));
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectValue(findProject.get(result.lastInsertRowid)));
    }
    const moveMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/move$/);
    if (moveMatch && request.method === 'POST') {
      const [, projectId, taskId] = moveMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived) return json(response, 409, { error: 'Archived project cannot be changed' });
      if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
      const body = await readJson(request);
      const destinationId = body?.destination_project_id;
      if (!Number.isSafeInteger(destinationId) || destinationId < 1 || destinationId === project.id) {
        return json(response, 400, { error: 'Choose another active destination project' });
      }
      const destination = findProject.get(destinationId);
      if (!destination) return json(response, 404, { error: 'Destination project not found' });
      if (destination.archived) return json(response, 409, { error: 'Destination project is archived' });
      // One statement changes ownership and order atomically, leaving task data intact.
      moveTask.run(destinationId, destinationId, projectId, taskId);
      return json(response, 200, taskValue(findTask.get(destinationId, taskId)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project cannot be changed' });
      }
      if (!taskId && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskValue));
      }
      if (!taskId && request.method === 'POST') {
        const body = await readJson(request);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title, project.default_task_priority, projectId);
        return json(response, 201, taskValue(findTask.get(projectId, result.lastInsertRowid)));
      }
      if (taskId && request.method === 'PATCH') {
        const task = findTask.get(projectId, taskId);
        if (!task) return json(response, 404, { error: 'Task not found' });
        const body = await readJson(request);
        const renaming = Object.hasOwn(body ?? {}, 'title');
        const changingCompletion = Object.hasOwn(body ?? {}, 'completed');
        const changingPriority = Object.hasOwn(body ?? {}, 'priority');
        const changingDueDate = Object.hasOwn(body ?? {}, 'due_date');
        if ((changingCompletion || (!renaming && !changingPriority && !changingDueDate)) && typeof body?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completed must be a boolean' });
        }
        const title = renaming ? (typeof body.title === 'string' ? body.title.trim() : '') : task.title;
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const priority = changingPriority ? body.priority : task.priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        const dueDate = changingDueDate ? normalizeDueDate(body.due_date) : task.due_date;
        if (dueDate === null) {
          return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
        updateTask.run(changingCompletion ? Number(body.completed) : task.completed, title, priority, dueDate, projectId, taskId);
        return json(response, 200, taskValue(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (projectMatch && ['GET', 'PATCH'].includes(request.method)) {
      const projectId = projectMatch[1];
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'PATCH') {
        const body = await readJson(request);
        const renaming = Object.hasOwn(body ?? {}, 'name');
        const changingArchive = Object.hasOwn(body ?? {}, 'archived');
        const changingDefault = Object.hasOwn(body ?? {}, 'default_task_priority');
        if ((changingArchive || (!renaming && !changingDefault)) && typeof body?.archived !== 'boolean') {
          return json(response, 400, { error: 'Archived must be a boolean' });
        }
        if (project.archived && (renaming || changingDefault)) {
          return json(response, 409, { error: 'Archived project cannot be changed' });
        }
        const defaultPriority = changingDefault ? body.default_task_priority : project.default_task_priority;
        if (!['Low', 'Normal', 'High'].includes(defaultPriority)) {
          return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
        }
        let name = project.name;
        if (renaming) {
          name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
        }
        updateProject.run(changingArchive ? Number(body.archived) : project.archived, name, defaultPriority, projectId);
      }
      return json(response, 200, projectValue(findProject.get(projectId)));
    }
    const assetPath = /^\/projects\/[1-9]\d*$/.test(path) ? '/' : path;
    const asset = assets.get(assetPath);
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
