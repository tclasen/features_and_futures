import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
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
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal'
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
const setTaskCompleted = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const setTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);

function validDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  if (+year < 1 || +month < 1 || +month > 12) return false;
  const date = new Date(0);
  date.setUTCFullYear(+year, +month, 0);
  const days = date.getUTCDate();
  return +day >= 1 && +day <= days;
}

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let project;
    try { project = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const name = typeof project.name === 'string' ? project.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let update;
    try { update = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const id = Number(archiveMatch[1]);
    if (!getProject.get(id)) return sendJson(res, 404, { error: 'Project not found' });
    setArchived.run(update.archived ? 1 : 0, id);
    return sendJson(res, 200, getProject.get(id));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskMatch && req.method === 'GET') {
    const projectId = Number(taskMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let task;
    try { task = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const projectId = Number(taskMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    if (getProject.get(projectId).archived) return sendJson(res, 403, { error: 'Archived project' });
    const result = addTask.run(projectId, title, getProject.get(projectId).defaultPriority);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: getProject.get(projectId).defaultPriority });
  }
  const completionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (completionMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let update;
    try { update = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const id = Number(completionMatch[1]);
    const existing = getTask.get(id);
    if (!existing) return sendJson(res, 404, { error: 'Task not found' });
    if (getProject.get(existing.projectId).archived) return sendJson(res, 403, { error: 'Archived project' });
    if (Object.hasOwn(update, 'dueDate')) {
      if (typeof update.dueDate !== 'string') return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const date = update.dueDate.trim();
      if (date && !validDate(date)) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(date || null, id);
    } else if (typeof update.title === 'string') {
      const title = update.title.trim();
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      setTaskTitle.run(title, id);
    } else if (typeof update.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(update.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      setTaskPriority.run(update.priority, id);
    } else {
      if (typeof update.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      setTaskCompleted.run(update.completed ? 1 : 0, id);
    }
    const task = getTask.get(id);
    return sendJson(res, 200, { ...task, completed: Boolean(task.completed) });
  }
  const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && match) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let update;
    try { update = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const id = Number(match[1]);
    const project = getProject.get(id);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 403, { error: 'Archived project' });
    if (typeof update.defaultPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(update.defaultPriority)) return sendJson(res, 400, { error: 'Invalid default task priority' });
      db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(update.defaultPriority, id);
      return sendJson(res, 200, getProject.get(id));
    }
    const name = typeof update.name === 'string' ? update.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
    return sendJson(res, 200, getProject.get(id));
  }
  if (req.method === 'GET' && match) {
    const project = getProject.get(Number(match[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch { res.writeHead(500); return res.end('Application unavailable'); }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
