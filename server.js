import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
await mkdir(databasePath.includes('/') ? databasePath.slice(0, databasePath.lastIndexOf('/')) : '.', { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
// Upgrade databases created by earlier Workboard checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === '/' || pathname.startsWith('/projects/')
    ? 'index.html'
    : normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = join(publicDirectory, requestedPath);
  if (!filePath.startsWith(`${publicDirectory}/`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
        SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({ ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount || 0) }));
    sendJson(response, 200, projects);
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    try {
      const { name } = await readJson(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const projectId = Number(archiveMatch[1]);
    const archived = archiveMatch[2] === 'archive';
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, projectId);
    if (!result.changes) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { id: projectId, archived });
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
    sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
    return;
  }

  if (tasksMatch && request.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot have tasks' });
        return;
      }
      const { title } = await readJson(request);
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, trimmedTitle);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title: trimmedTitle, completed: false });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const { completed } = await readJson(request);
      if (typeof completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion state is required' });
        return;
      }
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(completed ? 1 : 0, taskId, projectId);
      if (!result.changes) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      sendJson(response, 200, { id: taskId, projectId, completed });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET') {
    await serveStatic(decodeURIComponent(url.pathname), response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
