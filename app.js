import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
    if (Buffer.byteLength(body) > 16384) {
      throw new Error('Request body is too large');
    }
  }
  return JSON.parse(body);
}

export function createApplication(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  database.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const taskJson = (task) => ({ ...task, completed: Boolean(task.completed) });

  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }
      if (request.method === 'GET' && path === '/api/projects') {
        return sendJson(response, 200, listProjects.all());
      }
      if (request.method === 'POST' && path === '/api/projects') {
        let input;
        try {
          input = await readJson(request);
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON request' });
        }
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) {
          return sendJson(response, 400, { error: 'Project name is required' });
        }
        const result = insertProject.run(name);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
      }
      const projectMatch = /^\/api\/projects\/([1-9]\d*)$/.exec(path);
      if (request.method === 'GET' && projectMatch) {
        const project = findProject.get(projectMatch[1]);
        return project
          ? sendJson(response, 200, project)
          : sendJson(response, 404, { error: 'Project not found' });
      }
      const tasksMatch = /^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(path);
      if (tasksMatch) {
        const [, projectId, taskId] = tasksMatch;
        if (!findProject.get(projectId)) {
          return sendJson(response, 404, { error: 'Project not found' });
        }
        if (request.method === 'GET' && !taskId) {
          return sendJson(response, 200, listTasks.all(projectId).map(taskJson));
        }
        if ((request.method === 'POST' && !taskId) || (request.method === 'PATCH' && taskId)) {
          let input;
          try {
            input = await readJson(request);
          } catch {
            return sendJson(response, 400, { error: 'Invalid JSON request' });
          }
          if (request.method === 'POST') {
            const title = typeof input?.title === 'string' ? input.title.trim() : '';
            if (!title) {
              return sendJson(response, 400, { error: 'Task title is required' });
            }
            const result = insertTask.run(projectId, title);
            return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
          }
          if (typeof input?.completed !== 'boolean') {
            return sendJson(response, 400, { error: 'Task completion must be a boolean' });
          }
          const result = updateTask.run(Number(input.completed), projectId, taskId);
          return result.changes
            ? sendJson(response, 200, taskJson(findTask.get(projectId, taskId)))
            : sendJson(response, 404, { error: 'Task not found' });
        }
      }
      if (request.method === 'GET') {
        const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(path) ? '/' : path);
        if (asset) {
          response.writeHead(200, { 'Content-Type': asset[0] });
          return response.end(asset[1]);
        }
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: 'Unable to complete the request' });
    }
  });

  return { server, closeDatabase: () => database.close() };
}
