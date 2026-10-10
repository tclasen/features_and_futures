import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  )
`);
database.exec('PRAGMA foreign_keys = ON');

const page = await readFile(new URL('./index.html', import.meta.url));

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(response, 200, projects);
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readBody(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const parts = url.pathname.split('/');
    const id = Number(parts[3]);
    if (parts.length === 5 && parts[4] === 'tasks') {
      const project = Number.isInteger(id) && id > 0
        ? database.prepare('SELECT id FROM projects WHERE id = ?').get(id)
        : undefined;
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(id);
      return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
    }
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, project);
  }

  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    try {
      if (request.method === 'POST' && taskId === null) {
        const { title } = await readBody(request);
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) return sendJson(response, 400, { error: 'Task title is required' });
        const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, trimmedTitle);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title: trimmedTitle, completed: false });
      }
      if (request.method === 'PATCH' && taskId !== null) {
        const { completed } = await readBody(request);
        if (typeof completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
        const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, projectId, completed });
      }
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
