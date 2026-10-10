import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
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
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET sort_order = id');
}

function isValidDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const indexHtml = await readFile(new URL('./index.html', import.meta.url));
const appJs = await readFile(new URL('./app.js', import.meta.url));
const stylesCss = await readFile(new URL('./styles.css', import.meta.url));
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
      COUNT(t.id) AS totalCount, SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all().map(project => ({
        ...project, archived: Boolean(project.archived),
        totalCount: Number(project.totalCount), completedCount: Number(project.completedCount),
      })));
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRoute && req.method === 'PATCH') {
    const data = await readBody(req);
    if (['Low', 'Normal', 'High'].includes(data?.defaultPriority)) {
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(data.defaultPriority, Number(projectRoute[1]));
      if (!result.changes) return json(res, 404, { error: 'Project not found' });
      return json(res, 200, { id: Number(projectRoute[1]), defaultPriority: data.defaultPriority });
    }
    const name = data?.name;
    if (typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'Project name is required' });
    const cleanName = name.trim();
    const result = db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(cleanName, Number(projectRoute[1]));
    if (!result.changes) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { id: Number(projectRoute[1]), name: cleanName });
  }
  const projectStateRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectStateRoute && req.method === 'PATCH') {
    const data = await readBody(req);
    if (typeof data?.archived !== 'boolean') return json(res, 400, { error: 'Invalid request' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(data.archived ? 1 : 0, Number(projectStateRoute[1]));
    if (!result.changes) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { id: Number(projectStateRoute[1]), archived: data.archived });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readBody(req);
    const name = data?.name;
    if (typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name.trim());
    return json(res, 201, { id: Number(result.lastInsertRowid), name: name.trim() });
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  const moveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveRoute && req.method === 'PATCH') {
    const sourceId = Number(moveRoute[1]);
    const taskId = Number(moveRoute[2]);
    const data = await readBody(req);
    const destinationId = Number(data?.destinationProjectId);
    const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
    const destination = db.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
    if (!source || !destination || !task) return json(res, 404, { error: 'Project or task not found' });
    if (source.archived || destination.archived || sourceId === destinationId) return json(res, 400, { error: 'Invalid destination project' });
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(destinationId).next;
    db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationId, order, taskId, sourceId);
    return json(res, 200, { id: taskId, projectId: destinationId });
  }
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    if (req.method === 'GET' && !taskRoute[2]) {
      return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (req.method === 'POST' && !taskRoute[2]) {
      const data = await readBody(req);
      const title = data?.title;
      if (typeof title !== 'string' || !title.trim()) return json(res, 400, { error: 'Task title is required' });
      const cleanTitle = title.trim();
      const project = db.prepare('SELECT default_priority FROM projects WHERE id = ?').get(projectId);
      const priority = project.default_priority || 'Normal';
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next;
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, cleanTitle, priority, order);
      return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title: cleanTitle, completed: false, priority });
    }
    if (req.method === 'PATCH' && taskRoute[2]) {
      const data = await readBody(req);
      if (typeof data?.title === 'string') {
        if (!data.title.trim()) return json(res, 400, { error: 'Task title is required' });
        const title = data.title.trim();
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, Number(taskRoute[2]), projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
        return json(res, 200, { id: Number(taskRoute[2]), projectId, title });
      }
      if (typeof data?.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(data.priority)) return json(res, 400, { error: 'Invalid priority' });
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(data.priority, Number(taskRoute[2]), projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
        return json(res, 200, { id: Number(taskRoute[2]), projectId, priority: data.priority });
      }
      if (typeof data?.dueDate === 'string') {
        const dueDate = data.dueDate.trim();
        if (dueDate && !isValidDueDate(dueDate)) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const savedDate = dueDate || null;
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(savedDate, Number(taskRoute[2]), projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
        return json(res, 200, { id: Number(taskRoute[2]), projectId, dueDate: savedDate });
      }
      if (typeof data?.completed !== 'boolean') return json(res, 400, { error: 'Invalid request' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(data.completed ? 1 : 0, Number(taskRoute[2]), projectId);
      if (!result.changes) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { id: Number(taskRoute[2]), projectId, completed: data.completed });
    }
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(indexHtml);
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(appJs);
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); return res.end(stylesCss);
  }
  if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(indexHtml);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
});

server.listen(port, '0.0.0.0');
