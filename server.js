import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = resolve(process.env.DB_PATH ?? 'workboard.sqlite');
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  )
`);
// Upgrade databases created by earlier Workboard tasks.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
// Add priorities to databases created before Task 006.
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
database.exec('PRAGMA foreign_keys = ON');

const page = await readFile(new URL('./public/index.html', import.meta.url));
const styles = await readFile(new URL('./public/styles.css', import.meta.url));
const client = await readFile(new URL('./public/app.js', import.meta.url));

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType, 'x-content-type-options': 'nosniff' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const filter = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS totalCount,
        SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
    `).all(filter).map((project) => ({
      ...project,
      archived: Boolean(project.archived),
      totalCount: Number(project.totalCount),
      completedCount: Number(project.completedCount ?? 0),
    }));
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify(projects));
    return;
  }

  const projectStateRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectStateRoute && request.method === 'PATCH') {
    try {
      const payload = await readJson(request);
      if (typeof payload.archived !== 'boolean') {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid archive state' }));
        return;
      }
      const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?')
        .run(payload.archived ? 1 : 0, Number(projectStateRoute[1]));
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ archived: payload.archived }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  const renameProjectRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameProjectRoute && request.method === 'PATCH') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const result = database.prepare('UPDATE projects SET name = ? WHERE id = ?')
        .run(name, Number(renameProjectRoute[1]));
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ name }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      send(response, 201, 'application/json; charset=utf-8', JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  const tasksRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksRoute && request.method === 'GET') {
    const tasks = database.prepare(
      'SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id'
    ).all(Number(tasksRoute[1])).map((task) => ({ ...task, completed: Boolean(task.completed) }));
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify(tasks));
    return;
  }
  if (tasksRoute && request.method === 'POST') {
    try {
      const projectId = Number(tasksRoute[1]);
      const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      const projectState = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (projectState.archived) {
        send(response, 409, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        return;
      }
      const payload = await readJson(request);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
        return;
      }
      const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      send(response, 201, 'application/json; charset=utf-8', JSON.stringify({
        id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: 'Normal',
      }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskRoute && request.method === 'PATCH') {
    try {
      const projectId = Number(taskRoute[1]);
      const taskId = Number(taskRoute[2]);
      const projectState = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!projectState) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      if (projectState.archived) {
        send(response, 409, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        return;
      }
      const payload = await readJson(request);
      let result;
      if (typeof payload.completed === 'boolean') {
        result = database.prepare(
          'UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?'
        ).run(payload.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(payload.priority)) {
        result = database.prepare(
          'UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?'
        ).run(payload.priority, taskId, projectId);
      } else {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid task update' }));
        return;
      }
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ id: taskId, projectId, ...payload }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  const renameTaskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
  if (renameTaskRoute && request.method === 'PATCH') {
    try {
      const projectId = Number(renameTaskRoute[1]);
      const taskId = Number(renameTaskRoute[2]);
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      if (project.archived) {
        send(response, 409, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        return;
      }
      const payload = await readJson(request);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
        return;
      }
      const result = database.prepare(
        'UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?'
      ).run(title, taskId, projectId);
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ id: taskId, projectId, title }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    send(response, 200, 'text/css; charset=utf-8', styles);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    send(response, 200, 'text/javascript; charset=utf-8', client);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    send(response, 200, 'text/html; charset=utf-8', page);
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(port, '0.0.0.0');
