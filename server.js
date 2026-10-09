import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function taskJson(task) {
  return { ...task, completed: Boolean(task.completed) };
}
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
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
    if (Buffer.byteLength(body) > 16_384) {
      throw Object.assign(new Error('Request body too large'), { status: 413 });
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
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all());
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, findProject.get(Number(result.lastInsertRowid)));
    }
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const projectId = Number(taskMatch[1]);
      if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      const taskId = taskMatch[2] ? Number(taskMatch[2]) : null;
      if (taskId === null && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (taskId === null && request.method === 'POST') {
        const body = await readJson(request);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(response, 201, taskJson(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (taskId !== null && request.method === 'PATCH') {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const body = await readJson(request);
        if (typeof body?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completed must be a boolean' });
        }
        updateTask.run(Number(body.completed), projectId, taskId);
        return json(response, 200, taskJson(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return project
        ? json(response, 200, project)
        : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
      if (asset) {
        response.writeHead(200, { 'Content-Type': asset[0] });
        return response.end(asset[1]);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
