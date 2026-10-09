import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || resolve('data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
// Existing Task 002 databases keep their projects and tasks during this migration.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const projectSelection = `
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
`;
const listProjects = database.prepare(`${projectSelection} GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectSelection} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function taskData(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function projectData(project) {
  return { ...project, archived: Boolean(project.archived) };
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && pathname === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    const projectRoute = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      return json(response, project ? 200 : 404, project ? projectData(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectRoute) {
      if (!findProject.get(projectRoute[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      if (typeof input?.archived !== 'boolean') {
        return json(response, 400, { error: 'Archive state must be a boolean' });
      }
      updateProject.run(Number(input.archived), projectRoute[1]);
      return json(response, 200, projectData(findProject.get(projectRoute[1])));
    }
    if (request.method === 'POST' && pathname === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, projectData(findProject.get(Number(result.lastInsertRowid))));
    }
    const tasksRoute = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksRoute) {
      const [, projectId, taskId] = tasksRoute;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project' });
      }
      if (!taskId && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if (!taskId && request.method === 'POST') {
        const input = await readJson(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return json(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
      }
      if (taskId && request.method === 'PATCH') {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    const assetPath = /^\/projects\/\d+$/.test(pathname) ? '/' : pathname;
    if (request.method === 'GET' && assets.has(assetPath)) {
      const [contentType, body] = assets.get(assetPath);
      response.writeHead(200, { 'Content-Type': contentType });
      return response.end(body);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    json(response, 500, { error: 'Something went wrong' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
