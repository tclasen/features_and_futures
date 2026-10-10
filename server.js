import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute && req.method === 'GET' && !taskRoute[2]) {
    return sendJson(res, 200, listTasks.all(Number(taskRoute[1])).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskRoute && req.method === 'POST' && !taskRoute[2]) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const owner = getProject.get(Number(taskRoute[1]));
      if (!owner) return sendJson(res, 404, { error: 'Project not found' });
      if (owner.archived) return sendJson(res, 409, { error: 'Project is archived' });
      const result = createTask.run(Number(taskRoute[1]), title);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId: Number(taskRoute[1]), title, completed: false });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (taskRoute && req.method === 'PATCH' && taskRoute[2]) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      if (getProject.get(Number(taskRoute[1]))?.archived) return sendJson(res, 409, { error: 'Project is archived' });
      const result = updateTask.run(data.completed ? 1 : 0, Number(taskRoute[2]), Number(taskRoute[1]));
      return result.changes ? sendJson(res, 200, { completed: data.completed }) : sendJson(res, 404, { error: 'Task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const projectAction = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectAction && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.archived !== 'boolean') return sendJson(res, 400, { error: 'Invalid archive state' });
      const result = setArchived.run(data.archived ? 1 : 0, Number(projectAction[1]));
      return result.changes ? sendJson(res, 200, { archived: data.archived }) : sendJson(res, 404, { error: 'Project not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0).map(project => ({ ...project, archived: Boolean(project.archived) })));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500); return res.end('Application unavailable');
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
