import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
// Existing databases from Task 001/002 need the archive column added in place.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount,
      COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.created_at, p.rowid`).all();
    const result = projects.map((project) => ({
      ...project,
      archived: Boolean(project.archived),
      summary: `${project.completedCount}/${project.totalCount} completed`
    }));
    return json(response, 200, result);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(response, 400, { error: 'Invalid request' }); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, name, Date.now());
    return json(response, 201, project);
  }
  const projectItem = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectItem && request.method === 'PATCH') {
    const projectId = decodeURIComponent(projectItem[1]);
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(response, 400, { error: 'Invalid request' }); }
    if (typeof body.archived !== 'boolean') return json(response, 400, { error: 'Invalid archive state' });
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, projectId);
    if (!result.changes) return json(response, 404, { error: 'Project not found' });
    return json(response, 200, { id: projectId, archived: body.archived });
  }
  const taskCollection = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (taskCollection && request.method === 'GET') {
    const projectId = decodeURIComponent(taskCollection[1]);
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId);
    return json(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskCollection && request.method === 'POST') {
    const projectId = decodeURIComponent(taskCollection[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived project' });
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(response, 400, { error: 'Invalid request' }); }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json(response, 400, { error: 'Task title is required' });
    const task = { id: randomUUID(), projectId, title, completed: false };
    database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, projectId, title, Date.now());
    return json(response, 201, task);
  }
  const taskItem = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskItem && request.method === 'PATCH') {
    const projectId = decodeURIComponent(taskItem[1]);
    const taskId = decodeURIComponent(taskItem[2]);
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(response, 400, { error: 'Invalid request' }); }
    if (typeof body.completed !== 'boolean') return json(response, 400, { error: 'Invalid completion state' });
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived project' });
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return json(response, 404, { error: 'Task not found' });
    return json(response, 200, { id: taskId, projectId, completed: body.completed });
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    const html = await readFile(path.join(directory, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(html);
  }
  response.writeHead(404);
  response.end('Not found');
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Internal server error' });
    else response.end();
  });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
