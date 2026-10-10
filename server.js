import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
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
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const projectQuery = `
  SELECT projects.id, projects.name, projects.archived, projects.default_priority AS defaultPriority,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
`;
const listProjects = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');

function taskValue(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function projectValue(project) {
  return { ...project, archived: Boolean(project.archived) };
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function sendJson(response, status, value) {
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

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return sendJson(response, 200, listProjects.all().map(projectValue));
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return sendJson(response, 201, projectValue(findProject.get(Number(result.lastInsertRowid))));
    }
    const projectMatch = path.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return project
        ? sendJson(response, 200, projectValue(project))
        : sendJson(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = Number(projectMatch[1]);
      if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      if (input && Object.hasOwn(input, 'defaultPriority')) {
        if (Object.hasOwn(input, 'name') || Object.hasOwn(input, 'archived')) {
          return sendJson(response, 400, { error: 'Default priority changes must be separate requests' });
        }
        if (findProject.get(projectId).archived) {
          return sendJson(response, 409, { error: 'Archived project is read-only' });
        }
        if (!['Low', 'Normal', 'High'].includes(input.defaultPriority)) {
          return sendJson(response, 400, { error: 'Default priority must be Low, Normal, or High' });
        }
        updateProjectDefaultPriority.run(input.defaultPriority, projectId);
        return sendJson(response, 200, projectValue(findProject.get(projectId)));
      }
      if (input && Object.hasOwn(input, 'name')) {
        if (Object.hasOwn(input, 'archived')) {
          return sendJson(response, 400, { error: 'Rename and archive changes must be separate requests' });
        }
        if (findProject.get(projectId).archived) {
          return sendJson(response, 409, { error: 'Archived project is read-only' });
        }
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectId);
        return sendJson(response, 200, projectValue(findProject.get(projectId)));
      }
      if (typeof input?.archived !== 'boolean') {
        return sendJson(response, 400, { error: 'Archive state must be a boolean' });
      }
      updateProjectArchive.run(Number(input.archived), projectId);
      return sendJson(response, 200, projectValue(findProject.get(projectId)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = findProject.get(projectId);
      if (!project) {
        return sendJson(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'GET' && taskId === null) {
        return sendJson(response, 200, listTasks.all(projectId).map(taskValue));
      }
      if (request.method === 'POST' && taskId === null) {
        const input = await readJson(request);
        const currentProject = findProject.get(projectId);
        if (currentProject.archived) {
          return sendJson(response, 409, { error: 'Archived project is read-only' });
        }
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title, currentProject.defaultPriority);
        return sendJson(response, 201, taskValue(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (!findTask.get(projectId, taskId)) {
          return sendJson(response, 404, { error: 'Task not found' });
        }
        const input = await readJson(request);
        if (findProject.get(projectId).archived) {
          return sendJson(response, 409, { error: 'Archived project is read-only' });
        }
        if (input && Object.hasOwn(input, 'priority')) {
          if (Object.hasOwn(input, 'title') || Object.hasOwn(input, 'completed')) {
            return sendJson(response, 400, { error: 'Priority changes must be separate requests' });
          }
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return sendJson(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updateTaskPriority.run(input.priority, projectId, taskId);
          return sendJson(response, 200, taskValue(findTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'title')) {
          if (Object.hasOwn(input, 'completed')) {
            return sendJson(response, 400, { error: 'Rename and completion changes must be separate requests' });
          }
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return sendJson(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return sendJson(response, 200, taskValue(findTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') {
          return sendJson(response, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return sendJson(response, 200, taskValue(findTask.get(projectId, taskId)));
      }
    }
    const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(path) ? '/' : path);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
