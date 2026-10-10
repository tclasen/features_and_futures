import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
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
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const indexHtml = await readFile(join(root, 'index.html'));
const styles = await readFile(join(root, 'styles.css'));
const client = await readFile(join(root, 'client.js'));

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const payload = JSON.parse(body);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: 'Invalid JSON' });
        return;
      }
      throw error;
    }
    return;
  }

  if (url.pathname.startsWith('/api/projects/')) {
    const route = url.pathname.slice('/api/projects/'.length).split('/');
    const id = Number(route[0]);
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (route.length === 2 && route[1] === 'tasks') {
      if (request.method === 'GET') {
        sendJson(response, 200, database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(id));
        return;
      }
      if (request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        try {
          const payload = JSON.parse(body);
          const title = typeof payload.title === 'string' ? payload.title.trim() : '';
          if (!title) {
            sendJson(response, 400, { error: 'Task title is required' });
            return;
          }
          const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(id, title);
          sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId: id, title, completed: 0 });
        } catch (error) {
          if (error instanceof SyntaxError) {
            sendJson(response, 400, { error: 'Invalid JSON' });
            return;
          }
          throw error;
        }
        return;
      }
    }
    if (route.length === 3 && route[1] === 'tasks' && request.method === 'PATCH') {
      const taskId = Number(route[2]);
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const payload = JSON.parse(body);
        if (!Number.isInteger(taskId) || taskId < 1 || typeof payload.completed !== 'boolean') {
          sendJson(response, 400, { error: 'Invalid task update' });
          return;
        }
        const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(payload.completed ? 1 : 0, taskId, id);
        if (!result.changes) {
          sendJson(response, 404, { error: 'Task not found' });
          return;
        }
        sendJson(response, 200, { id: taskId, projectId: id, completed: payload.completed ? 1 : 0 });
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Invalid JSON' });
          return;
        }
        throw error;
      }
      return;
    }
    if (route.length !== 1) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, project);
      return;
    }
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    response.end(styles);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/client.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(client);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
