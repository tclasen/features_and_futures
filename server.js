import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const html = await readFile(new URL('./public/index.html', import.meta.url));
const javascript = await readFile(new URL('./public/app.js', import.meta.url));

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return send(response, 200, javascript, 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    const normalized = projects.map((project) => ({ ...project, archived: Boolean(project.archived) }));
    return send(response, 200, JSON.stringify(normalized));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const payload = await readJson(request);
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveRoute && request.method === 'POST') {
    const projectId = Number(archiveRoute[1]);
    const archived = archiveRoute[2] === 'archive';
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, projectId);
    if (!result.changes) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    return send(response, 200, JSON.stringify({ id: projectId, archived }));
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && request.method === 'GET') {
    const projectId = Number(taskRoute[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
    return send(response, 200, JSON.stringify(tasks.map((task) => ({ ...task, completed: Boolean(task.completed) }))));
  }
  if (taskRoute && request.method === 'POST') {
    const projectId = Number(taskRoute[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived projects cannot have tasks created' }));
    const payload = await readJson(request);
    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    if (!title) return send(response, 400, JSON.stringify({ error: 'Task title is required' }));
    const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
  }
  const completionRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (completionRoute && request.method === 'PATCH') {
    const projectId = Number(completionRoute[1]);
    const taskId = Number(completionRoute[2]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived project tasks cannot be changed' }));
    const payload = await readJson(request);
    if (typeof payload?.completed !== 'boolean') return send(response, 400, JSON.stringify({ error: 'Completion state is required' }));
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(payload.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return send(response, 404, JSON.stringify({ error: 'Task not found' }));
    return send(response, 200, JSON.stringify({ id: taskId, projectId, completed: payload.completed }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(response, 200, html, 'text/html; charset=utf-8');
  }
  return send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
