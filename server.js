import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT
  )
`);
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
database.exec('PRAGMA foreign_keys = ON');
const listProjects = database.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('archived') === 'true' ? 1 : 0));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskMatch && request.method === 'GET') {
    const project = getProject.get(Number(taskMatch[1]));
    return project ? sendJson(response, 200, listTasks.all(project.id)) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (taskMatch && request.method === 'POST') {
    const projectId = Number(taskMatch[1]);
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Active project not found' });
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = addTask.run(projectId, title, project.defaultPriority);
    return sendJson(response, 201, getTask.get(Number(result.lastInsertRowid)));
  }
  const taskUpdateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdateMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const project = getProject.get(Number(taskUpdateMatch[1]));
    if (!project || project.archived) return sendJson(response, 404, { error: 'Active project not found' });
    const result = updateTask.run(body.completed ? 1 : 0, Number(taskUpdateMatch[2]), Number(taskUpdateMatch[1]));
    return result.changes ? sendJson(response, 200, getTask.get(Number(taskUpdateMatch[2]))) : sendJson(response, 404, { error: 'Task not found' });
  }
  const taskPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/priority$/);
  if (taskPriorityMatch && request.method === 'PATCH') {
    const projectId = Number(taskPriorityMatch[1]);
    const taskId = Number(taskPriorityMatch[2]);
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Active project not found' });
    const body = await readBody(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const result = updatePriority.run(body.priority, taskId, projectId);
    return result.changes ? sendJson(response, 200, getTask.get(taskId)) : sendJson(response, 404, { error: 'Task not found' });
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
  if (taskRenameMatch && request.method === 'PATCH') {
    const projectId = Number(taskRenameMatch[1]);
    const taskId = Number(taskRenameMatch[2]);
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Active project not found' });
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = renameTask.run(title, taskId, projectId);
    return result.changes ? sendJson(response, 200, getTask.get(taskId)) : sendJson(response, 404, { error: 'Task not found' });
  }
  const dueDateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
  if (dueDateMatch && request.method === 'PATCH') {
    const projectId = Number(dueDateMatch[1]);
    const taskId = Number(dueDateMatch[2]);
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Active project not found' });
    const body = await readBody(request);
    const rawDate = typeof body?.dueDate === 'string' ? body.dueDate.trim() : '';
    let dueDate = null;
    if (rawDate) {
      const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const [, yearText, monthText, dayText] = match;
      const year = Number(yearText), month = Number(monthText), day = Number(dayText);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      dueDate = rawDate;
    }
    const result = updateDueDate.run(dueDate, taskId, projectId);
    return result.changes ? sendJson(response, 200, getTask.get(taskId)) : sendJson(response, 404, { error: 'Task not found' });
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    const projectId = Number(defaultPriorityMatch[1]);
    const body = await readBody(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const result = updateDefaultPriority.run(body.priority, projectId);
    return result.changes ? sendJson(response, 200, getProject.get(projectId)) : sendJson(response, 404, { error: 'Active project not found' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const counts = database.prepare('SELECT COUNT(*) AS totalCount, COALESCE(SUM(completed), 0) AS completedCount FROM tasks WHERE project_id = ?').get(project.id);
    return sendJson(response, 200, { ...project, ...counts });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && request.method === 'PATCH') {
    const projectId = Number(renameMatch[1]);
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = renameProject.run(name, projectId);
    return result.changes ? sendJson(response, 200, getProject.get(projectId)) : sendJson(response, 404, { error: 'Active project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
    const result = setArchived.run(body.archived ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
  }

  const asset = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.slice(1);
  if (asset.includes('..') || asset.includes('\\')) {
    response.writeHead(400).end();
    return;
  }
  try {
    const content = await readFile(path.join(root, 'public', asset));
    const type = asset.endsWith('.css') ? 'text/css' : asset.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    response.end(content);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
