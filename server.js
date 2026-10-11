import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'data/workboard.sqlite'));
await mkdir(resolve(dbPath, '..'), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
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
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount,
  COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const updateArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const createTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, listProjects.all());
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const projectId = decodeURIComponent(archiveMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const archived = archiveMatch[2] === 'archive' ? 1 : 0;
    updateArchive.run(archived, projectId);
    return sendJson(res, 200, { ...project, archived });
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    createProject.run(project.id, project.name, Date.now());
    return sendJson(res, 201, project);
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'PATCH' && projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be renamed' });
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    updateProjectName.run(name, projectId);
    return sendJson(res, 200, { ...project, name });
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      let payload;
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'Invalid request body' });
      }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), title, completed: 0 };
      createTask.run(task.id, projectId, title, Date.now());
      return sendJson(res, 201, task);
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    if (typeof payload?.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    const result = updateTask.run(payload.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
    return sendJson(res, 200, { id: taskId, completed: payload.completed ? 1 : 0 });
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(publicRoot, relative);
    if (file !== publicRoot && !file.startsWith(publicRoot + sep)) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(file);
      res.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream' });
      res.end(content);
      return;
    } catch {
      // Unknown browser routes use the same entry point; missing assets remain 404.
      if (!extname(relative)) {
        const content = await readFile(resolve(publicRoot, 'index.html'));
        res.writeHead(200, { 'content-type': mimeTypes['.html'] });
        res.end(content);
        return;
      }
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    else res.destroy();
  });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
