import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(here, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch {}
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch {}
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
  FROM projects p ORDER BY p.id`);
const html = await readFile(path.join(here, 'index.html'));

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, listProjects.all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
      let body = '';
      try {
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title, project.default_priority);
        return sendJson(res, 201, getTask.get(Number(result.lastInsertRowid), projectId));
      } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/?$/);
  if (req.method === 'PATCH' && renameMatch) {
    const projectId = Number(renameMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (['Low', 'Normal', 'High'].includes(data.default_priority)) {
        updateProjectDefault.run(data.default_priority, projectId);
        return sendJson(res, 200, getProject.get(projectId));
      }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      renameProject.run(name, projectId);
      return sendJson(res, 200, getProject.get(projectId));
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)\/?$/);
  if (req.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    return sendJson(res, 200, { ok: true });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const projectId = Number(taskMatch[1]), taskId = Number(taskMatch[2]);
      const project = getProject.get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
      if (typeof data.completed === 'boolean') updateTask.run(data.completed ? 1 : 0, taskId, projectId);
      else if (typeof data.title === 'string' && data.title.trim()) renameTask.run(data.title.trim(), taskId, projectId);
      else if (['Low', 'Normal', 'High'].includes(data.priority)) updatePriority.run(data.priority, taskId, projectId);
      else if (typeof data.due_date === 'string') {
        const dueDate = data.due_date.trim();
        if (dueDate && !isValidDate(dueDate)) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        updateDueDate.run(dueDate || null, taskId, projectId);
      }
      else return sendJson(res, 400, { error: typeof data.title === 'string' ? 'Task title is required' : 'Invalid task update' });
      const task = getTask.get(taskId, projectId);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, task);
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    if (Number.isInteger(id) && id > 0) {
      const project = getProject.get(id);
      if (project) return sendJson(res, 200, project);
    }
    return sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
