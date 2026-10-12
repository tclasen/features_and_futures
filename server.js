import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
// Upgrade databases created by earlier checkpoints without disturbing project IDs.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
database.exec('PRAGMA foreign_keys = ON');

const page = await readFile(join(root, 'index.html'));
const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, database.prepare(`
      SELECT p.id, p.name, p.archived, COUNT(t.id) AS total_count,
        COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({
      ...project,
      archived: Boolean(project.archived),
      total_count: Number(project.total_count),
      completed_count: Number(project.completed_count)
    })));
  }
  const projectArchive = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectArchive && request.method === 'PATCH') {
    const projectId = Number(projectArchive[1]);
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.archived), projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { id: projectId, archived: body.archived });
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectTasks = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (projectTasks) {
    const projectId = Number(projectTasks[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (request.method === 'POST') {
      if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
      let body;
      try {
        body = await readJson(request);
      } catch {
        return sendJson(response, 400, { error: 'Invalid request body' });
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    }
  }
  const taskCompletion = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskCompletion && request.method === 'PATCH') {
    const projectId = Number(taskCompletion[1]);
    const taskId = Number(taskCompletion[2]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, completed: body.completed });
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
