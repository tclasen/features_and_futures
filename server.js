import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
)`);
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
database.exec('UPDATE tasks SET position = id WHERE position = 0');
const publicDirectory = join(import.meta.dirname, 'public');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!database.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, database.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY position, id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const projectId = Number(tasksMatch[1]);
      const project = database.prepare('SELECT archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
      const position = Number(database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next);
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_priority, position);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_priority });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(response, 200, { archived: archiveMatch[2] === 'archive' }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveMatch && request.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const destinationId = Number(data.destinationProjectId);
      if (!Number.isSafeInteger(destinationId) || destinationId < 1) return sendJson(response, 400, { error: 'Invalid destination project' });
      const taskId = Number(moveMatch[1]);
      const task = database.prepare('SELECT tasks.project_id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(taskId);
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
      if (task.archived || !destination || destination.archived || task.project_id === destinationId) return sendJson(response, 409, { error: 'Invalid move destination' });
      const position = Number(database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(destinationId).next);
      database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ?').run(destinationId, position, taskId);
      return sendJson(response, 200, { destinationProjectId: destinationId });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
      const task = database.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(Number(taskMatch[1]));
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived project' });
      database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
      return sendJson(response, 200, { completed: data.completed });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (request.method === 'PATCH' && taskRenameMatch) {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const task = database.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(Number(taskRenameMatch[1]));
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived project' });
      database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, Number(taskRenameMatch[1]));
      return sendJson(response, 200, { title });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const taskDueDateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
  if (request.method === 'PATCH' && taskDueDateMatch) {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.dueDate !== 'string') return sendJson(response, 400, { error: 'Invalid due date' });
      const dueDate = data.dueDate.trim();
      if (dueDate && !isValidDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const id = Number(taskDueDateMatch[1]);
      const task = database.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(id);
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived project' });
      const savedDate = dueDate || null;
      database.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(savedDate, id);
      return sendJson(response, 200, { dueDate: savedDate });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const taskPriorityMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/priority$/);
  if (request.method === 'PATCH' && taskPriorityMatch) {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      const task = database.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(Number(taskPriorityMatch[1]));
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived project' });
      database.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(data.priority, Number(taskPriorityMatch[1]));
      return sendJson(response, 200, { priority: data.priority });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const projectDefaultMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (request.method === 'PATCH' && projectDefaultMatch) {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      const result = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(data.priority, Number(projectDefaultMatch[1]));
      if (result.changes) return sendJson(response, 200, { defaultPriority: data.priority });
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectDefaultMatch[1]));
      return project ? sendJson(response, 409, { error: 'Archived project' }) : sendJson(response, 404, { error: 'Project not found' });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(projectMatch[1]));
      if (result.changes) return sendJson(response, 200, { id: Number(projectMatch[1]), name });
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
      return project ? sendJson(response, 409, { error: 'Archived project' }) : sendJson(response, 404, { error: 'Project not found' });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET') {
    const requested = url.pathname === '/' || url.pathname.startsWith('/projects/') ? 'index.html' : url.pathname.slice(1);
    if (requested.includes('..') || requested.includes('/')) { response.writeHead(404).end(); return; }
    try {
      const content = await readFile(join(publicDirectory, requested));
      response.writeHead(200, { 'content-type': mimeTypes[extname(requested)] || 'application/octet-stream' });
      response.end(content);
    } catch { response.writeHead(404).end('Not found'); }
    return;
  }
  response.writeHead(405).end();
});

server.listen(port, '0.0.0.0');
