import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep databases created by earlier tasks compatible with the archive feature.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Add priorities to databases created before Task 006.
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER');
  db.exec('UPDATE tasks SET sort_order = id WHERE sort_order IS NULL');
}
// Keep a task's slot in every project it has visited so a later return can
// restore its former position. Existing tasks start with their current order.
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order)
  SELECT id, project_id, sort_order FROM tasks`);

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id`).all().map(project => ({
        ...project, archived: Boolean(project.archived),
        completedCount: Number(project.completedCount), totalCount: Number(project.totalCount)
      }));
    return sendJson(res, 200, projects);
  }
  const projectArchiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectArchiveRoute && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      if (typeof payload.archived !== 'boolean') return sendJson(res, 400, { error: 'Invalid archive state' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(payload.archived ? 1 : 0, Number(projectArchiveRoute[1]));
      if (!result.changes) return sendJson(res, 404, { error: 'Project not found' });
      return sendJson(res, 200, { id: Number(projectArchiveRoute[1]), archived: payload.archived });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectDefaultRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (projectDefaultRoute && req.method === 'PATCH') {
    try {
      const priority = (await readJson(req)).priority;
      if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      const projectId = Number(projectDefaultRoute[1]);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
      db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(priority, projectId);
      return sendJson(res, 200, { id: projectId, defaultPriority: priority });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectRenameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRenameRoute && req.method === 'PATCH') {
    try {
      const projectId = Number(projectRenameRoute[1]);
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be renamed' });
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return sendJson(res, 200, { id: projectId, name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') {
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(Number(taskRoute[1]));
    return sendJson(res, 200, tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskRoute && req.method === 'POST') {
    try {
      const projectId = Number(taskRoute[1]);
      const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
      const payload = await readJson(req);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const sortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next);
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_priority, sortOrder);
      const taskId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(taskId, projectId, sortOrder);
      return sendJson(res, 201, { id: taskId, projectId, title, completed: false, priority: project.default_priority });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const taskUpdate = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      const payload = await readJson(req);
      const taskId = Number(taskUpdate[1]);
      const task = db.prepare(`SELECT t.id, t.completed, t.project_id AS projectId, p.archived
        FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`).get(taskId);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
      if (Object.hasOwn(payload, 'destinationProjectId')) {
        const destinationId = Number(payload.destinationProjectId);
        const destination = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(destinationId);
        if (!destination || destination.archived || destinationId === Number(task.projectId)) return sendJson(res, 400, { error: 'Invalid destination project' });
        let position = db.prepare('SELECT sort_order FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId)?.sort_order;
        if (position === undefined) {
          position = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM task_project_positions WHERE project_id = ?').get(destinationId).next);
          db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(taskId, destinationId, position);
        }
        const nextOrder = position;
        db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ?').run(destinationId, nextOrder, taskId);
        return sendJson(res, 200, { id: taskId, projectId: destinationId });
      }
      if (Object.hasOwn(payload, 'title')) {
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, taskId);
        return sendJson(res, 200, { id: taskId, title, completed: Boolean(task.completed) });
      }
      if (Object.hasOwn(payload, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(payload.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
        db.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(payload.priority, taskId);
        return sendJson(res, 200, { id: taskId, priority: payload.priority });
      }
      if (Object.hasOwn(payload, 'dueDate')) {
        const dueDate = typeof payload.dueDate === 'string' ? payload.dueDate.trim() : '';
        if (dueDate) {
          const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!match) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          const year = Number(match[1]);
          const month = Number(match[2]);
          const day = Number(match[3]);
          const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
          const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
            return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
        }
        db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate || null, taskId);
        return sendJson(res, 200, { id: taskId, dueDate: dueDate || null });
      }
      if (typeof payload.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(payload.completed ? 1 : 0, taskId);
      return sendJson(res, 200, { id: taskId, completed: payload.completed });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500);
      return res.end('Application unavailable');
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
