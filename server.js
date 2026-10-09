import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
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

export function createApplication(dbPath = process.env.DB_PATH || './data/workboard.sqlite') {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec(`
    PRAGMA foreign_keys = ON;
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
  const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const getTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const taskData = (task) => ({ ...task, completed: Boolean(task.completed) });

  const server = createServer(async (request, response) => {
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
          const result = insertProject.run(name);
          return json(response, 201, getProject.get(Number(result.lastInsertRowid)));
        }
      }
      const tasksApi = pathname.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
      if (tasksApi) {
        const projectId = Number(tasksApi[1]);
        const taskId = tasksApi[2] ? Number(tasksApi[2]) : null;
        if (!getProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
        if (!taskId && request.method === 'GET') {
          return json(response, 200, listTasks.all(projectId).map(taskData));
        }
        if (!taskId && request.method === 'POST') {
          const input = await readJson(request);
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = insertTask.run(projectId, title);
          return json(response, 201, taskData(getTask.get(projectId, Number(result.lastInsertRowid))));
        }
        if (taskId && request.method === 'PATCH') {
          if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
          const input = await readJson(request);
          if (typeof input?.completed !== 'boolean') {
            return json(response, 400, { error: 'Completion must be a boolean' });
          }
          updateTask.run(Number(input.completed), projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
      }
      const projectApi = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
      if (request.method === 'GET' && projectApi) {
        const project = getProject.get(Number(projectApi[1]));
        return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'GET') {
        const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(pathname) ? '/' : pathname);
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
  server.on('close', () => database.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createApplication();
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Workboard listening on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
