import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
  )
`);
database.exec('PRAGMA foreign_keys = ON');
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.id`);
const findProject = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p WHERE p.id = ?`);
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = database.prepare("UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?");
const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function sendFile(response, filename, contentType) {
  try {
    const content = await readFile(join(root, filename));
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try {
      name = JSON.parse(body).name;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return sendJson(response, 400, { error: 'Project name is required' });
    }
    const trimmedName = name.trim();
    const result = createProject.run(trimmedName);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    let body;
    try { body = await readRequestJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body.name === 'string') {
      if (!body.name.trim()) return sendJson(response, 400, { error: 'Project name is required' });
      const result = renameProject.run(body.name.trim(), Number(projectMatch[1]));
      return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Active project not found' });
    }
    if (typeof body.archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
    const result = updateArchive.run(body.archived ? 1 : 0, Number(projectMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, { ...project, archived: Boolean(project.archived) }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (request.method === 'POST') {
      let body;
      try { body = await readRequestJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
      if (typeof body.title !== 'string' || !body.title.trim()) return sendJson(response, 400, { error: 'Task title is required' });
      const title = body.title.trim();
      const result = createTask.run(projectId, title);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: 'Normal' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    let body;
    try { body = await readRequestJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body.title === 'string') {
      if (!body.title.trim()) return sendJson(response, 400, { error: 'Task title is required' });
      const result = renameTask.run(body.title.trim(), taskId, projectId);
      return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof body.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      const result = updatePriority.run(body.priority, taskId, projectId);
      return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof body.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const result = updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return sendFile(response, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return sendFile(response, 'index.html', 'text/html; charset=utf-8');
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

async function readRequestJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
