import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(directory, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    due_date TEXT
  )
`);

// Add persistent priorities to databases created by earlier versions of Workboard.
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}

// Add the archive flag to databases created by earlier versions of Workboard.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}

const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived,
    COUNT(t.id) AS total_count,
    COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
// Add optional due dates to databases created before Task 009.
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}

const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(project = null) {
  const template = readFileSync(join(directory, 'index.html'), 'utf8');
  const initialProject = project ? JSON.stringify(project).replace(/</g, '\\u003c') : 'null';
  return template.replace('<!-- PROJECT_DATA -->', `<script>window.initialProject = ${initialProject};</script>`)
    .replace('<!-- PROJECT_HEADING -->', project ? escapeHtml(project.name) : '');
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    setProjectArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (request.method === 'POST' && renameMatch) {
    const projectId = Number(renameMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be renamed' });
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      renameProject.run(name, projectId);
      return sendJson(response, 200, findProject.get(projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    const projectId = Number(defaultPriorityMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
    try {
      const payload = await readJson(request);
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) {
        return sendJson(response, 400, { error: 'A valid task priority is required' });
      }
      updateProjectDefaultPriority.run(payload.priority, projectId);
      return sendJson(response, 200, findProject.get(projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(response, 201, findProject.get(result.lastInsertRowid));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      try {
        if (findProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived projects cannot have tasks' });
        const payload = await readJson(request);
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const project = findProject.get(projectId);
        const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)')
          .run(projectId, title, project.default_task_priority);
        return sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
      } catch {
        return sendJson(response, 400, { error: 'Invalid request' });
      }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    try {
      if (findProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
      const payload = await readJson(request);
      let result;
      if (typeof payload.completed === 'boolean') {
        result = updateTaskCompletion.run(payload.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(payload.priority)) {
        result = updateTaskPriority.run(payload.priority, taskId, projectId);
      } else {
        return sendJson(response, 400, { error: 'A valid completion or priority is required' });
      }
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const dueDateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
  if (request.method === 'POST' && dueDateMatch) {
    const projectId = Number(dueDateMatch[1]);
    const taskId = Number(dueDateMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    try {
      const payload = await readJson(request);
      const dueDate = typeof payload.due_date === 'string' ? payload.due_date.trim() : '';
      if (dueDate && !isValidDueDate(dueDate)) {
        return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      }
      const result = updateTaskDueDate.run(dueDate || null, taskId, projectId);
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
  if (request.method === 'POST' && renameTaskMatch) {
    const projectId = Number(renameTaskMatch[1]);
    const taskId = Number(renameTaskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    try {
      const payload = await readJson(request);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = renameTask.run(title, taskId, projectId);
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page());
  }
  const projectMatch = url.pathname.match(/^\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    if (!project) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Project not found');
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page(project));
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
