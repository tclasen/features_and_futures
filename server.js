import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
await mkdir(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  due_date TEXT
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id');
const createTaskWithPriority = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, id = (SELECT COALESCE(MAX(id), 0) + 1 FROM tasks) WHERE id = ? AND project_id = ?');
const page = await readFile(path.join(here, 'index.html'));

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= days;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(listProjects.all()));
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (renameRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const payload = JSON.parse(body);
      const id = Number(renameRoute[1]);
      const project = findProject.get(id);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(res, 409, JSON.stringify({ error: 'Archived project' }));
      if (Object.hasOwn(payload, 'defaultPriority')) {
        if (!['Low', 'Normal', 'High'].includes(payload.defaultPriority)) return send(res, 400, JSON.stringify({ error: 'Invalid default task priority' }));
        updateProjectDefault.run(payload.defaultPriority, id);
      } else {
        const name = String(payload.name ?? '').trim();
        if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
        renameProject.run(name, id);
      }
      return send(res, 200, JSON.stringify(findProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived;
      if (typeof archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
      const id = Number(archiveRoute[1]);
      if (!findProject.get(id)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      setArchived.run(archived ? 1 : 0, id);
      return send(res, 200, JSON.stringify(findProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(findProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute && req.method === 'GET' && !taskRoute[2]) {
    const projectId = Number(taskRoute[1]);
    if (!findProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    return send(res, 200, JSON.stringify(listTasks.all(projectId)));
  }
  if (taskRoute && req.method === 'POST' && !taskRoute[2]) {
    const projectId = Number(taskRoute[1]);
    const project = findProject.get(projectId);
    if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(res, 409, JSON.stringify({ error: 'Archived project' }));
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const title = String(JSON.parse(body).title ?? '').trim();
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = createTaskWithPriority.run(projectId, title, project.defaultPriority);
      return send(res, 201, JSON.stringify(findTask.get(Number(result.lastInsertRowid), projectId)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (taskRoute && req.method === 'PATCH' && taskRoute[2]) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      const projectId = Number(taskRoute[1]), taskId = Number(taskRoute[2]);
      const project = findProject.get(projectId);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(res, 409, JSON.stringify({ error: 'Archived project' }));
      const task = findTask.get(taskId, projectId);
      if (!task) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
      if (Object.hasOwn(payload, 'destinationProjectId')) {
        const destinationId = Number(payload.destinationProjectId);
        const destination = findProject.get(destinationId);
        if (!destination || destination.archived) return send(res, 400, JSON.stringify({ error: 'Invalid destination project' }));
        if (destinationId === projectId) return send(res, 400, JSON.stringify({ error: 'Invalid destination project' }));
        moveTask.run(destinationId, taskId, projectId);
        return send(res, 200, JSON.stringify(findTask.get(taskId, destinationId) || listTasks.all(destinationId).at(-1)));
      } else if (Object.hasOwn(payload, 'title')) {
        const title = String(payload.title ?? '').trim();
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        renameTask.run(title, taskId, projectId);
      } else if (Object.hasOwn(payload, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(payload.priority)) return send(res, 400, JSON.stringify({ error: 'Invalid task priority' }));
        updatePriority.run(payload.priority, taskId, projectId);
      } else if (Object.hasOwn(payload, 'dueDate')) {
        const value = String(payload.dueDate ?? '').trim();
        if (value && !isValidDate(value)) return send(res, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        updateDueDate.run(value || null, taskId, projectId);
      } else {
        if (typeof payload.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
        updateTask.run(payload.completed ? 1 : 0, taskId, projectId);
      }
      return send(res, 200, JSON.stringify(findTask.get(taskId, projectId)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'GET' && /^\/api\/projects\/\d+$/.test(url.pathname)) {
    const project = findProject.get(Number(url.pathname.split('/').at(-1)));
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
process.on('SIGINT', () => { server.close(); db.close(); });
process.on('SIGTERM', () => { server.close(); db.close(); });
