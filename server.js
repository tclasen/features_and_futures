import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
    ,default_priority TEXT NOT NULL DEFAULT 'Normal'
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
`);
// Upgrade databases created by earlier checkpoints without disturbing their data.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!projectColumns.includes('default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name);
if (!taskColumns.includes('priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
if (!taskColumns.includes('due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!taskColumns.includes('notes')) db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
if (!taskColumns.includes('deleted')) db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
// Record each task's position in every project it has belonged to. Existing
// databases seed positions from their current task order exactly once.
const seedPositions = db.prepare(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, rowid)
  FROM tasks`);
seedPositions.run();
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COALESCE(SUM(CASE WHEN t.deleted = 0 THEN 1 ELSE 0 END), 0) AS totalCount,
  COALESCE(SUM(CASE WHEN t.deleted = 0 AND t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const findProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority,
  t.due_date AS dueDate, t.notes, t.deleted FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position, t.created_at, t.rowid`);
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes FROM tasks WHERE id = ? AND project_id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name, archived: false };
      insertProject.run(project.id, project.name, Date.now());
      return json(res, 201, project);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (req.method === 'PATCH' && archiveMatch) {
    const projectId = decodeURIComponent(archiveMatch[1]);
    if (!findProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
    try {
      const body = await readJson(req);
      if (typeof body.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
      updateProjectArchived.run(body.archived ? 1 : 0, projectId);
      return json(res, 200, { id: projectId, archived: body.archived });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'PATCH' && renameMatch) {
    const projectId = decodeURIComponent(renameMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived projects cannot be renamed' });
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      updateProjectName.run(name, projectId);
      return json(res, 200, { id: projectId, name, archived: false });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (req.method === 'PATCH' && defaultPriorityMatch) {
    const projectId = decodeURIComponent(defaultPriorityMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived projects cannot be changed' });
    try {
      const body = await readJson(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
      updateProjectDefaultPriority.run(body.priority, projectId);
      return json(res, 200, { ...project, defaultPriority: body.priority, archived: false });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(decodeURIComponent(projectMatch[1]));
    return project ? json(res, 200, { ...project, archived: Boolean(project.archived) }) : json(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return json(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (req.method === 'POST') {
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot accept tasks' });
      try {
        const body = await readJson(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const task = { id: randomUUID(), projectId, title, completed: false, priority: project.defaultPriority };
        db.prepare('INSERT INTO tasks (id, project_id, title, completed, priority, created_at) VALUES (?, ?, ?, 0, ?, ?)').run(task.id, projectId, title, task.priority, Date.now());
        const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(task.id, projectId, nextPosition);
        return json(res, 201, task);
      } catch { return json(res, 400, { error: 'Invalid request' }); }
    }
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (req.method === 'POST' && moveMatch) {
    const sourceId = decodeURIComponent(moveMatch[1]);
    const taskId = decodeURIComponent(moveMatch[2]);
    const source = findProject.get(sourceId);
    if (!source) return json(res, 404, { error: 'Project not found' });
    if (source.archived) return json(res, 409, { error: 'Archived projects cannot move tasks' });
    try {
      const body = await readJson(req);
      const destinationId = typeof body.destinationProjectId === 'string' ? body.destinationProjectId : '';
      const destination = findProject.get(destinationId);
      if (!destination || destination.archived || destinationId === sourceId) return json(res, 400, { error: 'Invalid destination project' });
      const task = findTask.get(taskId, sourceId);
      if (!task) return json(res, 404, { error: 'Task not found' });
      if (db.prepare('SELECT deleted FROM tasks WHERE id = ?').get(taskId)?.deleted) return json(res, 409, { error: 'Deleted tasks cannot be moved' });
      const destinationPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
      if (!destinationPosition) {
        const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value;
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, destinationId, nextPosition);
      }
      const result = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?').run(destinationId, taskId, sourceId);
      if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { ...task, projectId: destinationId });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  const taskLifecycleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/(delete|restore)$/);
  if (req.method === 'POST' && taskLifecycleMatch) {
    const projectId = decodeURIComponent(taskLifecycleMatch[1]);
    const taskId = decodeURIComponent(taskLifecycleMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived project tasks cannot be changed' });
    const deleted = taskLifecycleMatch[3] === 'delete' ? 1 : 0;
    const result = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(deleted, taskId, projectId);
    if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, deleted: Boolean(deleted) });
  }
  if (req.method === 'PATCH' && taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived project tasks cannot be changed' });
    try {
      const existing = findTask.get(taskId, projectId);
      if (!existing) return json(res, 404, { error: 'Task not found' });
      if (existing.deleted) return json(res, 409, { error: 'Deleted tasks cannot be changed' });
      const body = await readJson(req);
      if (typeof body.title === 'string') {
        const title = body.title.trim();
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = updateTaskTitle.run(title, taskId, projectId);
        if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
        const task = findTask.get(taskId, projectId);
        return json(res, 200, { ...task, completed: Boolean(task.completed) });
      }
      if (typeof body.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(res, 400, { error: 'Invalid task priority' });
        const result = updateTaskPriority.run(body.priority, taskId, projectId);
        if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
        const task = findTask.get(taskId, projectId);
        return json(res, 200, { ...task, completed: Boolean(task.completed), priority: body.priority });
      }
      if (typeof body.dueDate === 'string') {
        const trimmed = body.dueDate.trim();
        const dueDate = trimmed === '' ? null : trimmed;
        if (dueDate !== null && !isValidDate(dueDate)) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const result = updateTaskDueDate.run(dueDate, taskId, projectId);
        if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
        const task = findTask.get(taskId, projectId);
        return json(res, 200, { ...task, completed: Boolean(task.completed) });
      }
      if (typeof body.notes === 'string') {
        const result = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?').run(body.notes, taskId, projectId);
        if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
        const task = findTask.get(taskId, projectId);
        return json(res, 200, { ...task, completed: Boolean(task.completed) });
      }
      if (typeof body.completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const result = updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      if (!Number(result.changes)) return json(res, 404, { error: 'Task not found' });
      return json(res, 200, { id: taskId, projectId, completed: body.completed });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return serveFile(res, 'index.html');
  }
  if (req.method === 'GET' && url.pathname.startsWith('/')) {
    const name = url.pathname.slice(1);
    if (name && !name.includes('..') && !name.includes('/')) return serveFile(res, name);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

async function serveFile(res, name) {
  try {
    const body = await readFile(join(root, 'public', name));
    res.writeHead(200, { 'content-type': mimeTypes[extname(name)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
