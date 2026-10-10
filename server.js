import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
const listProjects = db.prepare('SELECT p.id, p.name, p.archived, p.default_priority, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.created_at, p.rowid');
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, created_at = ? WHERE id = ? AND project_id = ?');
const nextTaskOrder = db.prepare('SELECT MAX(created_at) AS latest FROM tasks WHERE project_id = ?');
const app = await readFile(new URL('./index.html', import.meta.url));

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Request failed:', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal server error' }));
  });
});

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'PATCH' && renameMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(renameMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
    renameProject.run(name, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (req.method === 'PATCH' && archiveMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(archiveMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    setArchived.run(input.archived ? 1 : 0, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return send(201, JSON.stringify(project));
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (req.method === 'PATCH' && defaultPriorityMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(defaultPriorityMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    if (!['Low', 'Normal', 'High'].includes(input.priority)) return send(400, JSON.stringify({ error: 'Invalid priority' }));
    updateDefaultPriority.run(input.priority, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (req.method === 'PATCH' && moveMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const sourceId = decodeURIComponent(moveMatch[1]);
    const taskId = decodeURIComponent(moveMatch[2]);
    const source = getProject.get(sourceId);
    const destinationId = typeof input.destinationId === 'string' ? input.destinationId : '';
    const destination = getProject.get(destinationId);
    if (!source || !getTask.get(taskId, sourceId) || !destination) return send(404, JSON.stringify({ error: 'Not found' }));
    if (source.archived || destination.archived || sourceId === destinationId) return send(403, JSON.stringify({ error: 'Invalid move' }));
    const latest = nextTaskOrder.get(destinationId).latest ?? 0;
    moveTask.run(destinationId, Math.max(Date.now(), latest + 1), taskId, sourceId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const dueDateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/due-date$/);
  if (req.method === 'PATCH' && dueDateMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(dueDateMatch[1]);
    const taskId = decodeURIComponent(dueDateMatch[2]);
    if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    const value = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
    if (value && !validDate(value)) return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
    updateDueDate.run(value || null, taskId, projectId);
    return send(200, JSON.stringify({ ok: true, dueDate: value || null }));
  }
  const priorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/priority$/);
  if (req.method === 'PATCH' && priorityMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(priorityMatch[1]);
    const taskId = decodeURIComponent(priorityMatch[2]);
    if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    if (!['Low', 'Normal', 'High'].includes(input.priority)) return send(400, JSON.stringify({ error: 'Invalid priority' }));
    updatePriority.run(input.priority, taskId, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/rename$/);
  if (req.method === 'PATCH' && taskRenameMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(taskRenameMatch[1]);
    const taskId = decodeURIComponent(taskRenameMatch[2]);
    if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
    renameTask.run(title, taskId, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (req.method === 'GET' && !tasksMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    if (req.method === 'POST' && !tasksMatch[2]) {
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const task = { id: randomUUID(), projectId, title, completed: 0 };
      insertTask.run(task.id, projectId, title, Date.now(), getProject.get(projectId).default_priority);
      return send(201, JSON.stringify(task));
    }
    if (req.method === 'PATCH' && tasksMatch[2]) {
      const taskId = decodeURIComponent(tasksMatch[2]);
      if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      updateTask.run(input.completed ? 1 : 0, taskId, projectId);
      return send(200, JSON.stringify({ ok: true }));
    }
    return send(404, JSON.stringify({ error: 'Not found' }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(200, app, 'text/html; charset=utf-8');
  send(404, JSON.stringify({ error: 'Not found' }));
}
function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const days = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
