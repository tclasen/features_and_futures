import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const directory = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(directory, 'data', 'workboard.sqlite'));
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
database.exec('PRAGMA foreign_keys = ON');

const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}

const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived,
    COUNT(t.id) AS totalCount,
    COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ?
  GROUP BY p.id ORDER BY p.id
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskTitle = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const html = await readFile(join(directory, 'index.html'));

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const filter = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    sendJson(response, 200, listProjects.all(filter));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = createProject.run(name);
    sendJson(response, 201, findProject.get(result.lastInsertRowid));
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const project = findProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    updateProjectArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    sendJson(response, 200, findProject.get(projectId));
    return;
  }
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = findProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (project.archived) {
      sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      return;
    }
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    renameProject.run(name, projectId);
    sendJson(response, 200, findProject.get(projectId));
    return;
  }
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project || { error: 'Project not found' });
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST') {
      if (findProject.get(projectId).archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be changed' });
        return;
      }
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const result = createTask.run(projectId, title);
      sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
      return;
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    const project = findProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (project.archived) {
      sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      return;
    }
    const existingTask = findTask.get(taskId, projectId);
    if (!existingTask) {
      sendJson(response, 404, { error: 'Task not found' });
      return;
    }
    if (Object.hasOwn(body ?? {}, 'title')) {
      if (typeof body?.title !== 'string' || !body.title.trim()) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      updateTaskTitle.run(body.title.trim(), taskId, projectId);
    } else {
      if (typeof body?.completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion must be a boolean' });
        return;
      }
      updateTaskCompletion.run(body.completed ? 1 : 0, taskId, projectId);
    }
    const task = findTask.get(taskId, projectId);
    sendJson(response, task ? 200 : 404, task || { error: 'Task not found' });
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
