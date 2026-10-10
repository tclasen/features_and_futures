import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT
  );
`);
// Older databases from Task 001/002 have no archive column.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Add the Task 006 field to databases created by earlier checkpoints.
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
        COUNT(t.id) AS totalCount,
        COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({ ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount) }));
    return sendJson(response, 200, projects);
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, { ...project, archived: Boolean(project.archived) }) : sendJson(response, 404, { error: 'Project not found' });
  }

  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    const projectId = Number(defaultPriorityMatch[1]);
    const body = await readJson(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Default task priority is invalid' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot change their default task priority' });
    database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(body.priority, projectId);
    return sendJson(response, 200, { id: projectId, defaultPriority: body.priority });
  }

  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/name$/);
  if (renameMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const projectId = Number(renameMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { id: Number(archiveMatch[1]), archived: body.archived });
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const projectExists = database.prepare('SELECT archived, default_priority FROM projects WHERE id = ?').get(projectId);
    if (!projectExists) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)
        .map((task) => ({ ...task, completed: Boolean(task.completed) }));
      return sendJson(response, 200, tasks);
    }
    if (request.method === 'POST') {
      if (projectExists.archived) return sendJson(response, 409, { error: 'Archived projects cannot have new tasks' });
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, projectExists.default_priority);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: projectExists.default_priority });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  const taskDueDateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
  const taskPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/priority$/);
  const taskNameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/title$/);
  if (taskNameMatch && request.method === 'PATCH') {
    const projectId = Number(taskNameMatch[1]);
    const taskId = Number(taskNameMatch[2]);
    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const result = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, projectId, title });
  }
  if (taskPriorityMatch && request.method === 'PATCH') {
    const projectId = Number(taskPriorityMatch[1]);
    const taskId = Number(taskPriorityMatch[2]);
    const body = await readJson(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Task priority is invalid' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const result = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(body.priority, taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, projectId, priority: body.priority });
  }
  if (taskDueDateMatch && request.method === 'PATCH') {
    const projectId = Number(taskDueDateMatch[1]);
    const taskId = Number(taskDueDateMatch[2]);
    const body = await readJson(request);
    if (typeof body?.dueDate !== 'string') return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    const dueDate = body.dueDate.trim();
    if (dueDate && !isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const result = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate || null, taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, projectId, dueDate: dueDate || null });
  }
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, projectId, completed: body.completed });
  }

  const requestedPath = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.replace(/^\//, '');
  const filePath = resolve(root, 'public', requestedPath);
  if (!filePath.startsWith(resolve(root, 'public') + '/') && filePath !== resolve(root, 'public', 'index.html')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
