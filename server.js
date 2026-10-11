import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep this migration safe for databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    for (const project of projects) {
      project.archived = Boolean(project.archived);
      project.total_count = Number(project.total_count);
      project.completed_count = Number(project.completed_count);
    }
    return sendJson(response, 200, projects);
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.id = ? GROUP BY p.id`).get(Number(projectMatch[1]));
    if (project) {
      project.archived = Boolean(project.archived);
      project.total_count = Number(project.total_count);
      project.completed_count = Number(project.completed_count);
    }
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?')
      .run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const projectId = Number(renameMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
    return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) {
      return sendJson(response, 409, { error: 'Archived projects cannot receive tasks' });
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof payload.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(taskMatch[1]));
    if (task && database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) {
      return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    }
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(payload.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: Number(taskMatch[1]), completed: payload.completed });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(await readFile(join(root, 'index.html')));
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
