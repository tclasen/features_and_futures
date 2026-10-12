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
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    created_at INTEGER NOT NULL
  );
`);
// Upgrade databases created by earlier checkpoints without disturbing their data.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name);
if (!taskColumns.includes('priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');

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
        const task = { id: randomUUID(), projectId, title, completed: false };
        insertTask.run(task.id, projectId, title, Date.now());
        return json(res, 201, task);
      } catch { return json(res, 400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived project tasks cannot be changed' });
    try {
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
