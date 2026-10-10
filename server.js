import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
database.exec('PRAGMA foreign_keys = ON');
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}

const indexHtml = await readFile(path.join(directory, 'public', 'index.html'));
const clientJs = await readFile(path.join(directory, 'public', 'app.js'));
const stylesCss = await readFile(path.join(directory, 'public', 'styles.css'));

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`
      SELECT projects.id, projects.name, projects.archived,
        COUNT(tasks.id) AS totalCount,
        COALESCE(SUM(tasks.completed), 0) AS completedCount
      FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
      GROUP BY projects.id ORDER BY projects.id
    `).all();
    return sendJson(response, 200, projects.map(project => ({
      ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount)
    })));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const input = await readJson(request);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare(`SELECT id, name, archived FROM projects WHERE id = ?`).get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, { ...project, archived: Boolean(project.archived) }) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'PATCH' && projectMatch) {
    const input = await readJson(request);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const projectId = Number(projectMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
    return sendJson(response, 200, { id: projectId, name, archived: false });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { status: 'ok' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
    return sendJson(response, 200, tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) return sendJson(response, 409, { error: 'Archived projects cannot have tasks' });
    const input = await readJson(request);
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const input = await readJson(request);
    const existing = database.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(Number(taskMatch[1]));
    if (!existing) return sendJson(response, 404, { error: 'Task not found' });
    if (existing?.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    if (typeof input?.completed === 'boolean') {
      database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(Number(input.completed), Number(taskMatch[1]));
    } else if (typeof input?.title === 'string') {
      const title = input.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, Number(taskMatch[1]));
    } else {
      return sendJson(response, 400, { error: 'A task title or completion value is required' });
    }
    const task = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?').get(Number(taskMatch[1]));
    return sendJson(response, 200, { ...task, completed: Boolean(task.completed) });
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(clientJs);
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return response.end(stylesCss);
  }
  const pageMatch = url.pathname.match(/^\/projects\/(\d+)$/);
  if (request.method === 'GET' && pageMatch) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
