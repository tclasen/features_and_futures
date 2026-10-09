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
  // Migrate existing project databases without changing IDs or task ownership.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  const projectSelect = `SELECT p.id, p.name, p.archived,
    (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total,
    (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
    FROM projects p`;
  const listProjects = database.prepare(`${projectSelect} ORDER BY p.id`);
  const getProject = database.prepare(`${projectSelect} WHERE p.id = ?`);
  const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const projectData = (project) => ({ ...project, archived: Boolean(project.archived) });
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const getTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const taskData = (task) => ({ ...task, completed: Boolean(task.completed) });

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (pathname === '/api/projects') {
        if (request.method === 'GET') return json(response, 200, listProjects.all().map(projectData));
        if (request.method === 'POST') {
          const input = await readJson(request);
          const name = typeof input?.name === 'string' ? input.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          const result = insertProject.run(name);
          return json(response, 201, projectData(getProject.get(Number(result.lastInsertRowid))));
        }
      }
      const tasksApi = pathname.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
      if (tasksApi) {
        const projectId = Number(tasksApi[1]);
        const taskId = tasksApi[2] ? Number(tasksApi[2]) : null;
        const project = getProject.get(projectId);
        if (!project) return json(response, 404, { error: 'Project not found' });
        if (!taskId && request.method === 'GET') {
          return json(response, 200, listTasks.all(projectId).map(taskData));
        }
        if (!taskId && request.method === 'POST') {
          const input = await readJson(request);
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
          const result = insertTask.run(projectId, title);
          return json(response, 201, taskData(getTask.get(projectId, Number(result.lastInsertRowid))));
        }
        if (taskId && request.method === 'PATCH') {
          if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
          const input = await readJson(request);
          if (input && Object.hasOwn(input, 'title')) {
            const title = typeof input.title === 'string' ? input.title.trim() : '';
            if (!title) return json(response, 400, { error: 'Task title is required' });
            if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
            renameTask.run(title, projectId, taskId);
            return json(response, 200, taskData(getTask.get(projectId, taskId)));
          }
          if (typeof input?.completed !== 'boolean') {
            return json(response, 400, { error: 'Completion must be a boolean' });
          }
          if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
          updateTask.run(Number(input.completed), projectId, taskId);
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
      }
      const projectApi = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
      if (projectApi) {
        const id = Number(projectApi[1]);
        const project = getProject.get(id);
        if (!project) return json(response, 404, { error: 'Project not found' });
        if (request.method === 'GET') return json(response, 200, projectData(project));
        if (request.method === 'PATCH') {
          const input = await readJson(request);
          if (input && Object.hasOwn(input, 'name')) {
            const name = typeof input.name === 'string' ? input.name.trim() : '';
            if (!name) return json(response, 400, { error: 'Project name is required' });
            if (getProject.get(id).archived) return json(response, 409, { error: 'Archived project is read-only' });
            renameProject.run(name, id);
            return json(response, 200, projectData(getProject.get(id)));
          }
          if (typeof input?.archived !== 'boolean') {
            return json(response, 400, { error: 'Archived must be a boolean' });
          }
          updateProject.run(Number(input.archived), id);
          return json(response, 200, projectData(getProject.get(id)));
        }
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
