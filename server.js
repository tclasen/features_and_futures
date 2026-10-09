import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
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
// Migrate databases created before archive support without replacing existing data.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const projectQuery = `SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total_count,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed_count
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const updateProjectArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function taskJson(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function json(response, status, value) {
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

const assets = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/tasks.js': ['tasks.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all());
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived projects are read-only' });
      }
      if (taskId === null && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (taskId === null && request.method === 'POST') {
        const input = await readJson(request);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(response, 201, taskJson(getTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (taskId !== null && request.method === 'PATCH') {
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completed must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJson(getTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = Number(projectMatch[1]);
      if (!getProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      if (typeof input?.archived !== 'boolean') {
        return json(response, 400, { error: 'Archived must be a boolean' });
      }
      updateProjectArchive.run(Number(input.archived), projectId);
      return json(response, 200, getProject.get(projectId));
    }
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(Number(projectMatch[1]));
      return project
        ? json(response, 200, project)
        : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET') {
      const asset = assets[path];
      if (asset || path === '/' || /^\/projects\/\d+$/.test(path)) {
        const [file, type] = asset || ['index.html', 'text/html; charset=utf-8'];
        const content = await readFile(join(root, 'public', file));
        response.writeHead(200, { 'Content-Type': type });
        return response.end(content);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) {
      json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
