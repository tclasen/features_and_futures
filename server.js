import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
// Add the archive flag when opening databases created by earlier checkpoints.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total_count,
  COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = createProject.run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId));
  }
  if (tasksMatch && request.method === 'POST') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
    const result = createTask.run(projectId, title);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: 0 });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (typeof body?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      const task = getTask.get(taskId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      updatePriority.run(body.priority, taskId, projectId);
      return sendJson(response, 200, { id: taskId, priority: body.priority });
    }
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const task = getTask.get(taskId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      renameTask.run(title, taskId, projectId);
      return sendJson(response, 200, { id: taskId, title });
    }
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Task not found' });
    if (!getTask.get(taskId) || !updateTask.run(body.completed ? 1 : 0, taskId, projectId).changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, completed: body.completed });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(archiveMatch[1]);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    setArchived.run(body.archived ? 1 : 0, projectId);
    return sendJson(response, 200, { id: projectId, archived: body.archived });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (projectMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(projectMatch[1]);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  if (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname)) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(html);
    } catch {
      return sendJson(response, 500, { error: 'Application unavailable' });
    }
  }
  if (url.pathname === '/app.js' || url.pathname === '/styles.css') {
    try {
      const filename = url.pathname.slice(1);
      const content = await readFile(path.join(root, 'public', filename));
      response.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
      return response.end(content);
    } catch {
      return sendJson(response, 404, { error: 'Not found' });
    }
  }
  sendJson(response, 404, { error: 'Not found' });
}

const server = createServer((request, response) => {
  handle(request, response).catch(() => sendJson(response, 500, { error: 'Internal server error' }));
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
