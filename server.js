import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

async function readJson(request) {
  const chunks = [];
  let bodySize = 0;
  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export function createApplication(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  )`);
  database.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
  }
  const projectQuery = `SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
  const listProjects = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
  const getProject = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
  const archiveProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const projectData = (project) => ({ ...project, archived: Boolean(project.archived) });
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
  const getTask = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
  const taskData = (task) => ({ ...task, completed: Boolean(task.completed) });

  function json(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  }

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (pathname === '/api/projects' && request.method === 'GET') {
        return json(response, 200, listProjects.all().map(projectData));
      }
      if (pathname === '/api/projects' && request.method === 'POST') {
        const input = await readJson(request);
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        const result = insertProject.run(name);
        return json(response, 201, projectData(getProject.get(Number(result.lastInsertRowid))));
      }
      const tasksMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
      if (tasksMatch) {
        const projectId = Number(tasksMatch[1]);
        if (!getProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
        const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
        if (request.method === 'GET' && taskId === null) {
          return json(response, 200, listTasks.all(projectId).map(taskData));
        }
        if (request.method === 'POST' && taskId === null) {
          const input = await readJson(request);
          if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = insertTask.run(projectId, title);
          return json(response, 201, taskData(getTask.get(projectId, Number(result.lastInsertRowid))));
        }
        if (request.method === 'PATCH' && taskId !== null) {
          if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
          const input = await readJson(request);
          if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
          const fields = ['title', 'completed', 'priority'].filter((field) => Object.hasOwn(input ?? {}, field));
          if (fields.length > 1) {
            return json(response, 400, { error: 'Update title, completion, or priority separately' });
          }
          if (Object.hasOwn(input ?? {}, 'title')) {
            const title = typeof input.title === 'string' ? input.title.trim() : '';
            if (!title) return json(response, 400, { error: 'Task title is required' });
            renameTask.run(title, projectId, taskId);
          } else if (Object.hasOwn(input ?? {}, 'priority')) {
            if (!['Low', 'Normal', 'High'].includes(input.priority)) {
              return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
            }
            updateTaskPriority.run(input.priority, projectId, taskId);
          } else {
            if (typeof input?.completed !== 'boolean') {
              return json(response, 400, { error: 'Completion must be a boolean' });
            }
            updateTask.run(Number(input.completed), projectId, taskId);
          }
          return json(response, 200, taskData(getTask.get(projectId, taskId)));
        }
      }
      const projectMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
      if (request.method === 'PATCH' && projectMatch) {
        const projectId = Number(projectMatch[1]);
        if (!getProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
        const input = await readJson(request);
        if (Object.hasOwn(input ?? {}, 'name')) {
          if (Object.hasOwn(input, 'archived')) {
            return json(response, 400, { error: 'Update name or archive state separately' });
          }
          if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          renameProject.run(name, projectId);
        } else {
          if (typeof input?.archived !== 'boolean') {
            return json(response, 400, { error: 'Archive state must be a boolean' });
          }
          archiveProject.run(Number(input.archived), projectId);
        }
        return json(response, 200, projectData(getProject.get(projectId)));
      }
      if (request.method === 'GET' && projectMatch) {
        const project = getProject.get(Number(projectMatch[1]));
        return project
          ? json(response, 200, projectData(project))
          : json(response, 404, { error: 'Project not found' });
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
      if (error.status) return json(response, error.status, { error: error.message });
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Unable to complete the request' });
      else response.end();
    }
  });
  server.on('close', () => database.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApplication(process.env.DB_PATH || './data/workboard.sqlite');
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
    console.log(`Workboard listening on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
