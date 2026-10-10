import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  default_task_priority TEXT NOT NULL DEFAULT 'Normal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Upgrade databases created by earlier checkpoints without losing project data.
if (!db.prepare("PRAGMA table_info(projects)").all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
const needsTaskOrderMigration = !db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'sort_order');
if (needsTaskOrderMigration) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  // Keep the original ID order when upgrading older task tables.
  for (const project of db.prepare('SELECT DISTINCT project_id FROM tasks').all()) {
    const ordered = db.prepare('SELECT id FROM tasks WHERE project_id = ? ORDER BY id').all(project.project_id);
    const updateOrder = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
    ordered.forEach((task, index) => updateOrder.run(index, task.id));
  }
}

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  const completionRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  const taskRenameRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/rename\/?$/);
  const taskPriorityRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/priority\/?$/);
  const defaultPriorityRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority\/?$/);
  const taskDueDateRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date\/?$/);
  const taskMoveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move\/?$/);
  async function readBody() {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 100_000) throw Object.assign(new Error('Request body too large'), { status: 413 });
    }
    try { return JSON.parse(body); }
    catch { throw Object.assign(new Error('Invalid request body'), { status: 400 }); }
  }
  if (taskRoute && req.method === 'GET') {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId)
      .map((task) => ({ ...task, id: Number(task.id), projectId: Number(task.projectId), completed: Boolean(task.completed) }));
    return json(res, 200, tasks);
  }
  if (taskDueDateRoute && req.method === 'PATCH') {
    const projectId = Number(taskDueDateRoute[1]);
    const taskId = Number(taskDueDateRoute[2]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const rawDate = String(body.dueDate ?? '').trim();
    let dueDate = null;
    if (rawDate) {
      const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
        return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      }
      dueDate = rawDate;
    }
    const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate, taskId, projectId);
    if (!result.changes) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, dueDate });
  }
  if (taskMoveRoute && req.method === 'POST') {
    const sourceId = Number(taskMoveRoute[1]);
    const taskId = Number(taskMoveRoute[2]);
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const destinationId = Number(body.destinationProjectId);
    const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
    const destination = db.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    if (!source || !destination) return json(res, 404, { error: 'Project not found' });
    if (source.archived || destination.archived) return json(res, 400, { error: 'Archived projects cannot move tasks' });
    if (sourceId === destinationId) return json(res, 400, { error: 'Choose another project' });
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
    if (!task) return json(res, 404, { error: 'Task not found' });
    const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE project_id = ?').get(destinationId).next);
    db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationId, nextOrder, taskId, sourceId);
    return json(res, 200, { id: taskId, sourceProjectId: sourceId, destinationProjectId: destinationId });
  }
  if (taskPriorityRoute && req.method === 'PATCH') {
    const projectId = Number(taskPriorityRoute[1]);
    const taskId = Number(taskPriorityRoute[2]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
    const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(body.priority, taskId, projectId);
    if (!result.changes) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, priority: body.priority });
  }
  if (taskRoute && req.method === 'POST') {
    const projectId = Number(taskRoute[1]);
    const project = db.prepare('SELECT archived, default_task_priority FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const title = String(body.title ?? '').trim();
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next);
    const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_task_priority, nextOrder);
    return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.default_task_priority });
  }
  if (taskRenameRoute && req.method === 'PATCH') {
    const projectId = Number(taskRenameRoute[1]);
    const taskId = Number(taskRenameRoute[2]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const title = String(body.title ?? '').trim();
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
    if (!result.changes) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, title });
  }
  if (completionRoute && req.method === 'PATCH') {
    const projectId = Number(completionRoute[1]);
    const taskId = Number(completionRoute[2]);
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (typeof body.completed !== 'boolean') return json(res, 400, { error: 'Completion state is required' });
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, completed: body.completed });
  }
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
  if (defaultPriorityRoute && req.method === 'PATCH') {
    const id = Number(defaultPriorityRoute[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(id);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
    db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(body.priority, id);
    return json(res, 200, { id, defaultTaskPriority: body.priority });
  }
  const projectStateRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)\/?$/);
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/?$/);
  if (renameRoute && req.method === 'PATCH') {
    const id = Number(renameRoute[1]);
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const name = String(body.name ?? '').trim();
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(id);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 400, { error: 'Archived project' });
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
    return json(res, 200, { id, name });
  }
  if (projectStateRoute && req.method === 'POST') {
    const id = Number(projectStateRoute[1]);
    const archived = projectStateRoute[2] === 'archive' ? 1 : 0;
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived, id);
    if (!result.changes) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, { id, archived: Boolean(archived) });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare(`SELECT p.id, p.name, p.archived, p.default_task_priority AS defaultTaskPriority,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id ASC`).all().map((p) => ({
        ...p, id: Number(p.id), archived: Boolean(p.archived),
        completedCount: Number(p.completedCount), totalCount: Number(p.totalCount),
      })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let name;
    try { name = String((await readBody()).name ?? '').trim(); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    const html = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    else res.destroy();
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
