import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at INTEGER NOT NULL
  )
`);

const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');

const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
  FROM projects p WHERE p.archived = ? ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const updateProjectArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE id = ?');
const updateTaskCompletion = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ?');

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function serveAsset(response, file, type) {
  try {
    response.writeHead(200, { 'content-type': type });
    response.end(readFileSync(join(root, 'public', file)));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive\/?$/);
  if (archiveMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
    const project = getProject.get(decodeURIComponent(archiveMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    updateProjectArchive.run(body.archived ? 1 : 0, project.id);
    return sendJson(response, 200, { ...project, archived: body.archived ? 1 : 0 });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/name\/?$/);
  if (renameMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = getProject.get(decodeURIComponent(renameMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
    updateProjectName.run(name, project.id);
    return sendJson(response, 200, { ...project, name });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return sendJson(response, 201, project);
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      if (getProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived project' });
      let body;
      try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), title, completed: 0 };
      insertTask.run(task.id, projectId, title, Date.now());
      return sendJson(response, 201, task);
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/?$/);
  if (request.method === 'PATCH' && taskMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
    const task = getTask.get(decodeURIComponent(taskMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskCompletion.run(body.completed ? 1 : 0, task.id);
    return sendJson(response, 200, { ...task, completed: body.completed ? 1 : 0 });
  }
  const taskTitleMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/title\/?$/);
  if (request.method === 'PATCH' && taskTitleMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const task = getTask.get(decodeURIComponent(taskTitleMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskTitle.run(title, task.id);
    return sendJson(response, 200, { ...task, title });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const project = getProject.get(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/') return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/app.js') return serveAsset(response, 'app.js', 'text/javascript; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/styles.css') return serveAsset(response, 'styles.css', 'text/css; charset=utf-8');
  response.writeHead(404);
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
