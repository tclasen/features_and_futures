import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0)
)`);
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project_order ON tasks(project_id, id)`);
const projectSelection = `SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = database.prepare(`${projectSelection} WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectSelection} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function taskJson(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function projectJson(project) {
  return { ...project, archived: Boolean(project.archived) };
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
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

const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && pathname === '/api/projects') {
      const filter = url.searchParams.get('filter') ?? 'active';
      if (!['active', 'archived'].includes(filter)) {
        return sendJson(response, 400, { error: 'Invalid project filter' });
      }
      return sendJson(response, 200, listProjects.all(Number(filter === 'archived')).map(projectJson));
    }
    if (request.method === 'POST' && pathname === '/api/projects') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return sendJson(response, 201, projectJson(findProject.get(Number(result.lastInsertRowid))));
    }
    const projectMatch = /^\/api\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return project
        ? sendJson(response, 200, projectJson(project))
        : sendJson(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = Number(projectMatch[1]);
      if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const body = await readJson(request);
      if (typeof body?.archived !== 'boolean') {
        return sendJson(response, 400, { error: 'Archived must be a boolean' });
      }
      updateProject.run(Number(body.archived), projectId);
      return sendJson(response, 200, projectJson(findProject.get(projectId)));
    }
    const tasksMatch = /^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(pathname);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = findProject.get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return sendJson(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (request.method === 'POST' && taskId === null) {
        const body = await readJson(request);
        if (findProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived project cannot be changed' });
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return sendJson(response, 201, taskJson(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (!findTask.get(projectId, taskId)) return sendJson(response, 404, { error: 'Task not found' });
        const body = await readJson(request);
        if (findProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived project cannot be changed' });
        if (typeof body?.completed !== 'boolean') {
          return sendJson(response, 400, { error: 'Completed must be a boolean' });
        }
        updateTask.run(Number(body.completed), projectId, taskId);
        return sendJson(response, 200, taskJson(findTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'GET') {
      const asset = assets.get(pathname);
      const isPage = pathname === '/' || /^\/projects\/[1-9]\d*$/.test(pathname);
      if (asset || isPage) {
        const [file, contentType] = asset ?? ['index.html', 'text/html; charset=utf-8'];
        const content = await readFile(new URL(`./public/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType });
        return response.end(content);
      }
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    sendJson(response, error.status ?? 500, { error: error.status ? error.message : 'Unable to complete request' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));
function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
