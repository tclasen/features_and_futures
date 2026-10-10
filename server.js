import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
const projectSelect = `
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
`;
const listProjects = database.prepare(`${projectSelect} GROUP BY projects.id ORDER BY projects.id`);
const getProject = database.prepare(`${projectSelect} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = database.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE project_id = ? AND id = ?');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
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
        const result = createTask.run(projectId, title);
        return sendJson(response, 201, taskJson(getTask.get(projectId, result.lastInsertRowid)));
      }
      if (taskId && request.method === 'PATCH') {
        if (!getTask.get(projectId, taskId)) return sendJson(response, 404, { error: 'Task not found' });
        if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
        const input = await readJson(request);
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
