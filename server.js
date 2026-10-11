import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const dbPath = process.env.DB_PATH ?? './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
// Additive migration keeps databases created by earlier checkpoints usable.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

async function serveAsset(pathname, response) {
  // Project pages are client-rendered, so direct visits and reloads must load
  // the application shell before the browser can request the project data.
  const isProjectPage = /^\/projects\/\d+\/?$/.test(pathname);
  const requestedPath = pathname === '/' || isProjectPage ? '/index.html' : pathname;
  const relativePath = normalize(requestedPath).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  if (!relativePath || relativePath.includes('..')) {
    response.writeHead(400).end();
    return;
  }
  try {
    const body = await readFile(join('public', relativePath));
    response.writeHead(200, { 'content-type': contentTypes[extname(relativePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    sendJson(response, 200, listProjects.all(archived));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readBody(request);
      if (typeof name !== 'string' || !name.trim()) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name.trim());
      sendJson(response, 201, getProject.get(result.lastInsertRowid));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project ?? { error: 'Project not found' });
    return;
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/name$/);
  if (request.method === 'PATCH' && renameMatch) {
    try {
      const projectId = Number(renameMatch[1]);
      const { name } = await readBody(request);
      const project = getProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (typeof name !== 'string' || !name.trim()) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        return;
      }
      renameProject.run(name.trim(), projectId);
      sendJson(response, 200, getProject.get(projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-task-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    try {
      const projectId = Number(defaultPriorityMatch[1]);
      const project = getProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot change their default task priority' });
        return;
      }
      const { priority } = await readBody(request);
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        sendJson(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
        return;
      }
      updateProjectDefaultPriority.run(priority, projectId);
      sendJson(response, 200, getProject.get(projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST') {
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot have new tasks' });
        return;
      }
      try {
        const { title } = await readBody(request);
        if (typeof title !== 'string' || !title.trim()) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const result = createTask.run(projectId, title.trim(), project.defaultTaskPriority);
        sendJson(response, 201, getTask.get(result.lastInsertRowid, projectId));
      } catch {
        sendJson(response, 400, { error: 'Invalid request' });
      }
      return;
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const projectId = Number(archiveMatch[1]);
      const { archived } = await readBody(request);
      if (typeof archived !== 'boolean') {
        sendJson(response, 400, { error: 'Archive state must be a boolean' });
        return;
      }
      if (!getProject.get(projectId)) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      setProjectArchived.run(archived ? 1 : 0, projectId);
      sendJson(response, 200, getProject.get(projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const task = getTask.get(taskId, projectId);
      if (!task) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      if (getProject.get(projectId).archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const body = await readBody(request);
      if (typeof body.completed === 'boolean') {
        updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(body.priority)) {
        updateTaskPriority.run(body.priority, taskId, projectId);
      } else {
        sendJson(response, 400, { error: 'Completion must be a boolean or priority must be Low, Normal, or High' });
        return;
      }
      sendJson(response, 200, getTask.get(taskId, projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/title$/);
  if (request.method === 'PATCH' && renameTaskMatch) {
    try {
      const projectId = Number(renameTaskMatch[1]);
      const taskId = Number(renameTaskMatch[2]);
      const task = getTask.get(taskId, projectId);
      if (!task) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      if (getProject.get(projectId).archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const { title } = await readBody(request);
      if (typeof title !== 'string' || !title.trim()) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      renameTask.run(title.trim(), taskId, projectId);
      sendJson(response, 200, getTask.get(taskId, projectId));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    await serveAsset(url.pathname, response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
