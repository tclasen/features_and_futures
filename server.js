import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const updateArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.created_at, p.rowid`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?, created_at = (
  SELECT COALESCE(MAX(created_at), 0) + 1 FROM tasks WHERE project_id = ? AND id != ?
) WHERE id = ? AND project_id = ?`);

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res, status, data) => send(res, status, JSON.stringify(data));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      if (typeof payload.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
      const result = updateArchived.run(payload.archived ? 1 : 0, archiveMatch[1]);
      return result.changes ? json(res, 200, { archived: payload.archived }) : json(res, 404, { error: 'Project not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return json(res, 413, { error: 'Request too large' });
      }
      const payload = JSON.parse(raw);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      insertProject.run(project.id, project.name, Date.now());
      return json(res, 201, project);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!getProject.get(tasksMatch[1])) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, listTasks.all(tasksMatch[1]).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return json(res, 413, { error: 'Request too large' });
      }
      const payload = JSON.parse(raw);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const owner = getProject.get(tasksMatch[1]);
      if (!owner) return json(res, 404, { error: 'Project not found' });
      if (owner.archived) return json(res, 403, { error: 'Archived project' });
      const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: false };
      task.priority = owner.defaultPriority;
      insertTask.run(task.id, task.projectId, task.title, Date.now(), task.priority);
      return json(res, 201, task);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (moveMatch && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      const source = getProject.get(moveMatch[1]);
      const destination = typeof payload.destinationProjectId === 'string' ? getProject.get(payload.destinationProjectId) : null;
      if (!source) return json(res, 404, { error: 'Project not found' });
      if (source.archived || !destination || destination.archived || destination.id === source.id) return json(res, 400, { error: 'Invalid destination project' });
      const result = moveTask.run(destination.id, destination.id, moveMatch[2], moveMatch[2], source.id);
      return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Task not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      const owner = getProject.get(taskMatch[1]);
      if (!owner) return json(res, 404, { error: 'Project not found' });
      if (owner.archived) return json(res, 403, { error: 'Archived project' });
      if (Object.hasOwn(payload, 'dueDate')) {
        if (payload.dueDate !== null && typeof payload.dueDate !== 'string') return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const dueDate = typeof payload.dueDate === 'string' ? payload.dueDate.trim() || null : null;
        if (dueDate !== null && !isValidDueDate(dueDate)) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        updateTaskDueDate.run(dueDate, taskMatch[2], taskMatch[1]);
        const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskMatch[2], taskMatch[1]);
        return task ? json(res, 200, { dueDate }) : json(res, 404, { error: 'Task not found' });
      }
      if (typeof payload.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(payload.priority)) return json(res, 400, { error: 'Invalid task priority' });
        const result = updateTaskPriority.run(payload.priority, taskMatch[2], taskMatch[1]);
        return result.changes ? json(res, 200, { priority: payload.priority }) : json(res, 404, { error: 'Task not found' });
      }
      if (typeof payload.title === 'string') {
        const title = payload.title.trim();
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = updateTaskTitle.run(title, taskMatch[2], taskMatch[1]);
        return result.changes ? json(res, 200, { title }) : json(res, 404, { error: 'Task not found' });
      }
      if (typeof payload.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const result = updateTask.run(payload.completed ? 1 : 0, taskMatch[2], taskMatch[1]);
      return result.changes ? json(res, 200, { completed: payload.completed }) : json(res, 404, { error: 'Task not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      const project = getProject.get(projectMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 403, { error: 'Archived project' });
      if (typeof payload.defaultPriority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(payload.defaultPriority)) return json(res, 400, { error: 'Invalid default task priority' });
        updateProjectDefault.run(payload.defaultPriority, projectMatch[1]);
        return json(res, 200, { defaultPriority: payload.defaultPriority });
      }
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      updateProjectName.run(name, projectMatch[1]);
      return json(res, 200, { id: project.id, name });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(projectMatch[1]);
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Unable to load application' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
