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
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  )`);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  database.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  const projectQuery = `SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
  const listProjects = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
  const findProject = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
  const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const taskJson = (task) => ({ ...task, completed: Boolean(task.completed) });
  const projectJson = (project) => ({ ...project, archived: Boolean(project.archived) });

  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }
      if (request.method === 'GET' && path === '/api/projects') {
        return sendJson(response, 200, listProjects.all().map(projectJson));
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
        return sendJson(response, 201, projectJson(findProject.get(Number(result.lastInsertRowid))));
      }
      const projectMatch = /^\/api\/projects\/([1-9]\d*)$/.exec(path);
      if (request.method === 'GET' && projectMatch) {
        const project = findProject.get(projectMatch[1]);
        return project
          ? sendJson(response, 200, projectJson(project))
          : sendJson(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'PATCH' && projectMatch) {
        let input;
        try {
          input = await readJson(request);
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON request' });
        }
        if (typeof input?.archived !== 'boolean') {
          return sendJson(response, 400, { error: 'Project archive state must be a boolean' });
        }
        const result = updateProject.run(Number(input.archived), projectMatch[1]);
        return result.changes
          ? sendJson(response, 200, projectJson(findProject.get(projectMatch[1])))
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
          if (findProject.get(projectId).archived) {
            return sendJson(response, 409, { error: 'Archived project is read-only' });
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
