import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
// Keep databases created by earlier Workboard versions compatible.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p WHERE p.archived = ? ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readBody(request);
      const cleanName = typeof name === 'string' ? name.trim() : '';
      if (!cleanName) return sendJson(response, 400, { error: 'Project name is required' });
      const result = createProject.run(cleanName);
      return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    try {
      const projectId = Number(projectMatch[1]);
      const body = await readBody(request);
      if (typeof body.name === 'string') {
        const cleanName = body.name.trim();
        if (!cleanName) return sendJson(response, 400, { error: 'Project name is required' });
        const currentProject = getProject.get(projectId);
        if (!currentProject) return sendJson(response, 404, { error: 'Project not found' });
        if (currentProject.archived) return sendJson(response, 400, { error: 'Archived projects cannot be renamed' });
        renameProject.run(cleanName, projectId);
      } else if (typeof body.archived === 'boolean') {
        updateProjectArchive.run(body.archived ? 1 : 0, projectId);
      } else {
        return sendJson(response, 400, { error: 'Invalid project update' });
      }
      const project = getProject.get(projectId);
      return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (request.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId));
  }
  if (request.method === 'POST' && tasksMatch) {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
      const { title } = await readBody(request);
      const cleanTitle = typeof title === 'string' ? title.trim() : '';
      if (!cleanTitle) return sendJson(response, 400, { error: 'Task title is required' });
      const result = createTask.run(projectId, cleanTitle);
      return sendJson(response, 201, getTask.get(Number(result.lastInsertRowid), projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const project = getProject.get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
      const body = await readBody(request);
      if (typeof body.title === 'string') {
        const cleanTitle = body.title.trim();
        if (!cleanTitle) return sendJson(response, 400, { error: 'Task title is required' });
        renameTask.run(cleanTitle, taskId, projectId);
      } else if (typeof body.completed === 'boolean') {
        updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      } else {
        return sendJson(response, 400, { error: 'Invalid task update' });
      }
      const task = getTask.get(taskId, projectId);
      return task ? sendJson(response, 200, task) : sendJson(response, 404, { error: 'Task not found' });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const page = await readFile(join(root, 'public', 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    } catch {
      response.writeHead(500);
      return response.end('Application unavailable');
    }
  }
  if (request.method === 'GET' && ['/app.js', '/styles.css'].includes(url.pathname)) {
    const type = url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
    try {
      const content = await readFile(join(root, 'public', url.pathname.slice(1)));
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    } catch {
      response.writeHead(404);
      return response.end('Not found');
    }
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0');
