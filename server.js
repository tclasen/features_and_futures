import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
    SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid
`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const project = { id: randomUUID(), name, archived: 0 };
    insertProject.run(project.id, project.name, Date.now());
    sendJson(response, 201, project);
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const projectId = decodeURIComponent(archiveMatch[1]);
    const project = getProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') {
      sendJson(response, 400, { error: 'Project archive state must be a boolean' });
      return;
    }
    updateProjectArchive.run(body.archived ? 1 : 0, projectId);
    sendJson(response, 200, { ...project, archived: body.archived ? 1 : 0 });
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && ['GET', 'PATCH'].includes(request.method)) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        return;
      }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const task = { id: randomUUID(), projectId, title, completed: 0 };
      insertTask.run(task.id, projectId, title, Date.now());
      sendJson(response, 201, task);
      return;
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    const existing = getTask.get(taskId, projectId);
    if (!existing) {
      sendJson(response, 404, { error: 'Task not found' });
      return;
    }
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') {
      sendJson(response, 400, { error: 'Task completion must be a boolean' });
      return;
    }
    updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    sendJson(response, 200, { ...existing, completed: body.completed ? 1 : 0 });
    return;
  }

  if (request.method !== 'GET') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const filePath = url.pathname === '/' || url.pathname.startsWith('/projects/')
    ? join(publicDirectory, 'index.html')
    : join(publicDirectory, url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(filePath);
    const type = extname(filePath) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
