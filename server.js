import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }

const indexHtml = await readFile(new URL('./index.html', import.meta.url));
const projectHtml = await readFile(new URL('./project.html', import.meta.url));

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    json(response, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
      FROM projects p WHERE p.archived = ? ORDER BY p.id`).all(archived).map(p => ({...p, archived: Boolean(p.archived)})));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { json(response, 400, { error: 'Project name is required' }); return; }
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    json(response, 201, { id: Number(result.lastInsertRowid), name });
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) { json(response, 404, { error: 'Project not found' }); return; }
    json(response, 200, {...project, archived: Boolean(project.archived)});
    return;
  }
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) { json(response, 404, { error: 'Project not found' }); return; }
    if (project.archived) { json(response, 403, { error: 'Archived project' }); return; }
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { json(response, 400, { error: 'Project name is required' }); return; }
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
    json(response, 200, { id: projectId, name });
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) { json(response, 404, { error: 'Project not found' }); return; }
    json(response, 200, { archived: archiveMatch[2] === 'archive' });
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) { json(response, 404, { error: 'Project not found' }); return; }
    json(response, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    return;
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) { json(response, 404, { error: 'Project not found' }); return; }
    if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) { json(response, 403, { error: 'Archived project' }); return; }
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) { json(response, 400, { error: 'Task title is required' }); return; }
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    json(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readBody(request);
    if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId)?.archived) { json(response, 403, { error: 'Archived project' }); return; }
    if (Object.hasOwn(body || {}, 'title')) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) { json(response, 400, { error: 'Task title is required' }); return; }
      const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
      if (!result.changes) { json(response, 404, { error: 'Task not found' }); return; }
      json(response, 200, { id: taskId, title });
      return;
    }
    if (Object.hasOwn(body || {}, 'priority')) {
      const priority = body.priority;
      if (!['Low', 'Normal', 'High'].includes(priority)) { json(response, 400, { error: 'Invalid task priority' }); return; }
      const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(priority, taskId, projectId);
      if (!result.changes) { json(response, 404, { error: 'Task not found' }); return; }
      json(response, 200, { id: taskId, priority });
      return;
    }
    if (typeof body?.completed !== 'boolean') { json(response, 400, { error: 'Completion state is required' }); return; }
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) { json(response, 404, { error: 'Task not found' }); return; }
    json(response, 200, { id: taskId, completed: body.completed });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }
  if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(projectHtml);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
