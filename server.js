import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
// Keep existing databases compatible with the original projects schema.
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const addTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const name = String((await readBody(request)).name ?? '').trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      addProject.run(project.id, project.name, Date.now());
      return sendJson(response, 201, project);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const id = decodeURIComponent(archiveMatch[1]);
    if (!getProject.get(id)) return sendJson(response, 404, { error: 'Project not found' });
    setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
    return sendJson(response, 200, { status: 'ok' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      try {
        if (getProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived project' });
        const title = String((await readBody(request)).title ?? '').trim();
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const task = { id: randomUUID(), projectId, title, completed: 0 };
        addTask.run(task.id, projectId, title, Date.now());
        return sendJson(response, 201, task);
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const projectId = decodeURIComponent(taskMatch[1]);
      const taskId = decodeURIComponent(taskMatch[2]);
      const { completed } = await readBody(request);
      if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      if (getProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived project' });
      const result = updateTask.run(completed ? 1 : 0, taskId, projectId);
      return result.changes ? sendJson(response, 200, { status: 'ok' }) : sendJson(response, 404, { error: 'Task not found' });
    } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(await readFile(path.join(here, 'index.html')));
  }
  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(await readFile(path.join(here, 'index.html')));
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
