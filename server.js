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
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  )
`);
// Upgrade databases created by earlier Workboard tasks.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
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
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
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
      SELECT p.id, p.name, p.archived, p.default_task_priority AS defaultTaskPriority,
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

  const projectDefaultRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (projectDefaultRoute && request.method === 'PATCH') {
    try {
      const payload = await readJson(request);
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid default task priority' }));
        return;
      }
      const result = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?')
        .run(payload.priority, Number(projectDefaultRoute[1]));
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ priority: payload.priority }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
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
      'SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id'
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
      const defaultPriority = database.prepare('SELECT default_task_priority FROM projects WHERE id = ?').get(projectId).default_task_priority;
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, defaultPriority);
      send(response, 201, 'application/json; charset=utf-8', JSON.stringify({
        id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: defaultPriority,
      }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  const moveTaskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveTaskRoute && request.method === 'PATCH') {
    try {
      const sourceId = Number(moveTaskRoute[1]);
      const taskId = Number(moveTaskRoute[2]);
      const payload = await readJson(request);
      const destinationId = Number(payload.destinationProjectId);
      const source = database.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
      const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
      if (!source || !destination) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
        return;
      }
      if (source.archived || destination.archived) {
        send(response, 409, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        return;
      }
      if (sourceId === destinationId) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Choose another project' }));
        return;
      }
      // DatabaseSync does not expose a transaction wrapper. Keep the copy and
      // delete atomic with explicit SQLite transaction statements.
      database.exec('BEGIN IMMEDIATE');
      try {
        const task = database.prepare('SELECT title, completed, priority, due_date FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
        if (!task) {
          database.exec('ROLLBACK');
          send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task not found' }));
          return;
        }
        database.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES (?, ?, ?, ?, ?)')
          .run(destinationId, task.title, task.completed, task.priority, task.due_date);
        database.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(taskId, sourceId);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ moved: true }));
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
      } else if (typeof payload.dueDate === 'string') {
        const dueDate = payload.dueDate.trim();
        if (dueDate && !isValidDueDate(dueDate)) {
          send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
          return;
        }
        result = database.prepare(
          'UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?'
        ).run(dueDate || null, taskId, projectId);
      } else {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid task update' }));
        return;
      }
      if (result.changes === 0) {
        send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task not found' }));
        return;
      }
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ id: taskId, projectId, ...payload, ...(typeof payload.dueDate === 'string' ? { dueDate: payload.dueDate.trim() || null } : {}) }));
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

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

server.listen(port, '0.0.0.0');
