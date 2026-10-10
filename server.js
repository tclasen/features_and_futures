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
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  )
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT
  )
`);
database.exec('PRAGMA foreign_keys = ON');
// Upgrade databases created by the earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth;
}

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
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS totalCount,
        SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({
      ...project,
      archived: Boolean(project.archived),
      totalCount: Number(project.totalCount),
      completedCount: Number(project.completedCount || 0),
    }));
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
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id').all(id);
      return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
    }
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
  }

  const projectUpdate = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectUpdate) {
    const id = Number(projectUpdate[1]);
    try {
      const update = await readBody(request);
      if (typeof update.archived === 'boolean') {
        const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(update.archived ? 1 : 0, id);
        if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
        return sendJson(response, 200, { id, archived: update.archived });
      }
      if (typeof update.name === 'string') {
        const name = update.name.trim();
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        const result = database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
        if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
        return sendJson(response, 200, { id, name });
      }
      if (['Low', 'Normal', 'High'].includes(update.defaultPriority)) {
        const result = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(update.defaultPriority, id);
        if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
        return sendJson(response, 200, { id, defaultPriority: update.defaultPriority });
      }
      return sendJson(response, 400, { error: 'Invalid project update' });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
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
        const project = database.prepare('SELECT default_priority FROM projects WHERE id = ?').get(projectId);
        const priority = project.default_priority;
        const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, trimmedTitle, priority);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title: trimmedTitle, completed: false, priority });
      }
      if (request.method === 'PATCH' && taskId !== null) {
        const update = await readBody(request);
        if (typeof update.completed === 'boolean') {
          const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(update.completed ? 1 : 0, taskId, projectId);
          if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
          return sendJson(response, 200, { id: taskId, projectId, completed: update.completed });
        }
        if (typeof update.title === 'string') {
          const title = update.title.trim();
          if (!title) return sendJson(response, 400, { error: 'Task title is required' });
          const result = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
          if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
          return sendJson(response, 200, { id: taskId, projectId, title });
        }
        if (['Low', 'Normal', 'High'].includes(update.priority)) {
          const result = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(update.priority, taskId, projectId);
          if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
          return sendJson(response, 200, { id: taskId, projectId, priority: update.priority });
        }
        if (typeof update.dueDate === 'string') {
          const dueDate = update.dueDate.trim();
          if (dueDate && !isValidDueDate(dueDate)) {
            return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          const savedDate = dueDate || null;
          const result = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(savedDate, taskId, projectId);
          if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
          return sendJson(response, 200, { id: taskId, projectId, dueDate: savedDate });
        }
        return sendJson(response, 400, { error: 'Invalid task update' });
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
