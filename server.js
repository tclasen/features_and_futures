import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const indexHtml = await readFile(join(import.meta.dirname, 'public', 'index.html'));
const clientJs = await readFile(join(import.meta.dirname, 'public', 'app.js'));

async function readBody(request) {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    return { value: JSON.parse(raw) };
  } catch {
    return { error: 'Invalid JSON' };
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
    if (request.method === 'GET' && !taskId) {
      return sendJson(response, 200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'POST' && !taskId) {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const body = await readBody(request);
      if (body.error) return sendJson(response, 400, { error: body.error });
      const title = typeof body.value?.title === 'string' ? body.value.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: 'Normal' });
    }
    if (request.method === 'PATCH' && taskId) {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const body = await readBody(request);
      if (body.error) return sendJson(response, 400, { error: body.error });
      if (typeof body.value?.priority === 'string') {
        const priority = body.value.priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(priority, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, priority });
      }
      if (typeof body.value?.title === 'string') {
        const title = body.value.title.trim();
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, title });
      }
      if (typeof body.value?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be boolean' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.value.completed), taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, completed: body.value.completed });
    }
    return sendJson(response, 404, { error: 'Not found' });
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRoute && request.method === 'PATCH') {
    const body = await readBody(request);
    if (body.error) return sendJson(response, 400, { error: body.error });
    const id = Number(projectRoute[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(id);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (typeof body.value?.name === 'string') {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const name = body.value.name.trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
      return sendJson(response, 200, { id, name });
    }
    if (typeof body.value?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archived must be boolean' });
    db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.value.archived), id);
    return sendJson(response, 200, { id, archived: body.value.archived });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    return sendJson(response, 200, projects.map(project => ({ ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount) })));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const parsed = await readBody(request);
    if (parsed.error) return sendJson(response, 400, { error: parsed.error });
    const name = typeof parsed.value?.name === 'string' ? parsed.value.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(clientJs);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
