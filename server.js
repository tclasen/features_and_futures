import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
database.exec('PRAGMA foreign_keys = ON');
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS totalCount
  FROM projects p
  WHERE p.archived = ? AND p.id = (SELECT MAX(latest.id) FROM projects latest WHERE latest.name = p.name)
  ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    return sendJson(response, 200, listProjects.all(archived));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskMatch && request.method === 'GET') {
    const project = getProject.get(Number(taskMatch[1]));
    return project ? sendJson(response, 200, listTasks.all(project.id)) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (taskMatch && request.method === 'POST') {
    const projectId = Number(taskMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 403, { error: 'Archived project' });
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = addTask.run(projectId, title);
    return sendJson(response, 201, getTask.get(Number(result.lastInsertRowid)));
  }
  const taskUpdateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdateMatch && request.method === 'PATCH') {
    const project = getProject.get(Number(taskUpdateMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 403, { error: 'Archived project' });
    const body = await readBody(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const result = updateTask.run(body.completed ? 1 : 0, Number(taskUpdateMatch[2]), Number(taskUpdateMatch[1]));
    return result.changes ? sendJson(response, 200, getTask.get(Number(taskUpdateMatch[2]))) : sendJson(response, 404, { error: 'Task not found' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (projectMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
    const result = updateArchive.run(body.archived ? 1 : 0, Number(projectMatch[1]));
    return result.changes ? sendJson(response, 200, getProject.get(Number(projectMatch[1]))) : sendJson(response, 404, { error: 'Project not found' });
  }

  const asset = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.slice(1);
  if (asset.includes('..') || asset.includes('\\')) {
    response.writeHead(400).end();
    return;
  }
  try {
    const content = await readFile(path.join(root, 'public', asset));
    const type = asset.endsWith('.css') ? 'text/css' : asset.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    response.end(content);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
