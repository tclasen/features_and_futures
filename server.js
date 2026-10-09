import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
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

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    try {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
  }

  if (url.pathname.startsWith('/api/projects/')) {
    const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (taskRoute) {
      const id = Number(taskRoute[1]);
      const exists = Number.isSafeInteger(id) && id > 0
        ? database.prepare('SELECT id FROM projects WHERE id = ?').get(id)
        : undefined;
      if (!exists) return sendJson(response, 404, { error: 'Project not found' });
      if (request.method === 'GET') {
        const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(id);
        return sendJson(response, 200, tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
      }
      if (request.method === 'POST') {
        try {
          const body = await readJson(request);
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title) return sendJson(response, 400, { error: 'Task title is required' });
          const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(id, title);
          return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
        } catch {
          return sendJson(response, 400, { error: 'Invalid request body' });
        }
      }
      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
    if (taskMatch && request.method === 'PATCH') {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      try {
        const body = await readJson(request);
        if (typeof body.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
        const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
          .run(body.completed ? 1 : 0, taskId, projectId);
        if (result.changes === 0) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, completed: body.completed });
      } catch {
        return sendJson(response, 400, { error: 'Invalid request body' });
      }
    }

    if (request.method === 'GET') {
      const id = Number(url.pathname.slice('/api/projects/'.length));
      const project = Number.isSafeInteger(id) && id > 0
        ? database.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
        : undefined;
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      return sendJson(response, 200, project);
    }
  }

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(path.join(root, 'public', 'index.html')));
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
