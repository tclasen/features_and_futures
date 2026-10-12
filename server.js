import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_by_project ON tasks(project_id, id)`);
const projectQuery = `SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = db.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
const findProject = db.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
const projectData = project => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
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

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      return json(response, project ? 200 : 404, project ? projectData(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      if (!findProject.get(projectMatch[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readBody(request);
      const hasName = Object.hasOwn(input ?? {}, 'name');
      const hasArchive = Object.hasOwn(input ?? {}, 'archived');
      if ((!hasName && !hasArchive) || (hasArchive && typeof input.archived !== 'boolean')) {
        return json(response, 400, { error: 'Archive state must be a boolean' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (hasName) {
        if (findProject.get(projectMatch[1]).archived) return json(response, 409, { error: 'Archived project' });
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectMatch[1]);
      }
      if (hasArchive) updateProject.run(Number(input.archived), projectMatch[1]);
      return json(response, 200, projectData(findProject.get(projectMatch[1])));
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readBody(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectData(findProject.get(Number(result.lastInsertRowid))));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if (request.method === 'POST' && !taskId) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        const input = await readBody(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(response, 201, taskData(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readBody(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskData(findTask.get(projectId, taskId)));
      }
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
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
