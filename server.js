import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
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
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
database.exec('PRAGMA foreign_keys = ON');
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const readBody = (request) => new Promise((resolveBody, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try { resolveBody(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
  });
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    sendJson(response, 200, projects.map((project) => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    if (!result.changes) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { archived: archiveMatch[2] === 'archive' });
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
      return;
    }
    if (request.method === 'POST') {
      try {
        const body = await readBody(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
      } catch {
        sendJson(response, 400, { error: 'Invalid request' });
      }
      return;
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const body = await readBody(request);
      if (typeof body.completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion must be a boolean' });
        return;
      }
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, Number(taskMatch[1]));
      if (!result.changes) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      sendJson(response, 200, { completed: body.completed });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET') {
    const file = url.pathname === '/' || url.pathname.startsWith('/projects/')
      ? 'index.html'
      : url.pathname.slice(1);
    if (file === 'index.html' || file === 'app.js' || file === 'styles.css') {
      const { readFile } = await import('node:fs/promises');
      try {
        const content = await readFile(join(root, 'public', file));
        const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8' };
        response.writeHead(200, { 'content-type': types[file] });
        response.end(content);
      } catch {
        response.writeHead(404).end('Not found');
      }
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
