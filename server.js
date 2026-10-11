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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
// Add archive state to databases created by earlier task checkpoints.
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
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER');
  database.exec('UPDATE tasks SET sort_order = id');
}
database.exec('PRAGMA foreign_keys = ON');

const indexHtml = await readFile(path.join(root, 'index.html'));
const clientJs = await readFile(path.join(root, 'app.js'));
const css = await readFile(path.join(root, 'style.css'));

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, database.prepare(`
      SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
        COUNT(t.id) AS totalCount,
        COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({ ...project, id: Number(project.id), archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount) })));
  }
  if (url.pathname === '/api/projects/active' && req.method === 'GET') {
    return sendJson(res, 200, database.prepare('SELECT id, name FROM projects WHERE archived = 0 ORDER BY id').all().map((p) => ({ ...p, id: Number(p.id) })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && req.method === 'POST') {
    const archived = archiveMatch[2] === 'archive' ? 1 : 0;
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived, Number(archiveMatch[1]));
    return result.changes ? sendJson(res, 200, { archived: Boolean(archived) }) : sendJson(res, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (renameMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const id = Number(renameMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(id);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
    if (Object.hasOwn(data, 'name')) {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
      return sendJson(res, 200, { id, name });
    }
    if (Object.hasOwn(data, 'defaultPriority')) {
      if (!['Low', 'Normal', 'High'].includes(data.defaultPriority)) return sendJson(res, 400, { error: 'Invalid default task priority' });
      database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(data.defaultPriority, id);
      return sendJson(res, 200, { id, defaultPriority: data.defaultPriority });
    }
    return sendJson(res, 400, { error: 'No project fields to update' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(projectId));
  }
  if (tasksMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
    const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(projectId).value;
    const result = database.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_priority, nextOrder);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: 0, priority: project.default_priority });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const taskId = Number(moveMatch[1]);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    const source = database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id);
    const destinationId = Number(data.destinationProjectId);
    const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    if (source.archived || !destination || destination.archived || destinationId === Number(task.project_id)) return sendJson(res, 400, { error: 'Invalid destination project' });
    const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(destinationId).value;
    database.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ?').run(destinationId, nextOrder, taskId);
    return sendJson(res, 200, { id: taskId, projectId: destinationId });
  }
  if (taskMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let data;
    try { data = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const taskId = Number(taskMatch[1]);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id)?.archived) return sendJson(res, 403, { error: 'Archived project' });
    if (Object.hasOwn(data, 'title')) {
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, taskId);
      return sendJson(res, 200, { id: taskId, title });
    }
    if (Object.hasOwn(data, 'priority')) {
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      database.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(data.priority, taskId);
      return sendJson(res, 200, { id: taskId, priority: data.priority });
    }
    if (Object.hasOwn(data, 'dueDate')) {
      const dueDate = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
      if (dueDate && !isValidDate(dueDate)) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      database.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate || null, taskId);
      return sendJson(res, 200, { id: taskId, dueDate: dueDate || null });
    }
    if (typeof data.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, taskId);
    return sendJson(res, 200, { completed: data.completed });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(clientJs);
  }
  if (req.method === 'GET' && url.pathname === '/style.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return res.end(css);
  }
  if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthDays[month - 1];
}

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
