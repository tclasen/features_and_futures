import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);
// Upgrade databases created by earlier checkpoints without disturbing their data.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
    COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const mimeType = (path) => contentTypes[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream';
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    return sendJson(res, 200, listProjects.all(archived).map((project) => ({
      ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount),
    })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return sendJson(res, 201, project);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(projectMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const counts = database.prepare(`SELECT COUNT(*) AS totalCount, COALESCE(SUM(completed), 0) AS completedCount FROM tasks WHERE project_id = ?`).get(project.id);
    return sendJson(res, 200, { ...project, archived: Boolean(project.archived), totalCount: Number(counts.totalCount), completedCount: Number(counts.completedCount) });
  }
  if (req.method === 'PATCH' && projectMatch) {
    const project = findProject.get(projectMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    renameProject.run(name, project.id);
    return sendJson(res, 200, { ...project, name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    const project = findProject.get(archiveMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const body = await readJson(req);
    if (typeof body?.archived !== 'boolean') return sendJson(res, 400, { error: 'Archive state is required' });
    updateProjectArchive.run(body.archived ? 1 : 0, project.id);
    return sendJson(res, 200, { ...project, archived: body.archived });
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!findProject.get(tasksMatch[1])) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, listTasks.all(tasksMatch[1]).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    const project = findProject.get(tasksMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: false };
    insertTask.run(task.id, task.projectId, task.title, Date.now());
    return sendJson(res, 201, task);
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'PATCH') {
    const project = findProject.get(taskMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    if (typeof body?.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    const result = updateTaskCompletion.run(body.completed ? 1 : 0, taskMatch[2], taskMatch[1]);
    if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
    return sendJson(res, 200, { id: taskMatch[2], projectId: taskMatch[1], completed: body.completed });
  }

  const requestedPath = url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.replace(/^\//, '');
  const filePath = join(root, 'public', requestedPath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'content-type': mimeType(filePath) });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
