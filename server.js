import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (url.pathname === '/health' && request.method === 'GET') return sendJson(response, 200, { status: 'ok' });
    if (url.pathname === '/api/projects' && request.method === 'GET') {
      return sendJson(response, 200, db.prepare(`SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS totalCount,
        COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
        FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id ORDER BY p.id`).all().map((project) => ({
          ...project, archived: Boolean(project.archived),
        })));
    }
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name, archived: false, totalCount: 0, completedCount: 0 });
    }
    const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectRoute && request.method === 'PATCH') {
      const id = Number(projectRoute[1]);
      const body = await readJson(request);
      const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(id);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (typeof body.name === 'string') {
        if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        const name = body.name.trim();
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
        return sendJson(response, 200, { id, name, archived: Boolean(project.archived) });
      }
      if (typeof body.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
      db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, id);
      return sendJson(response, 200, { id, archived: body.archived });
    }
    const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskRoute) {
      const projectId = Number(taskRoute[1]);
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
        return sendJson(response, 404, { error: 'Project not found' });
      }
      if (!taskRoute[2] && request.method === 'GET') {
        const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
        return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
      }
      if (!taskRoute[2] && request.method === 'POST') {
        if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) {
          return sendJson(response, 409, { error: 'Archived projects cannot accept tasks' });
        }
        const body = await readJson(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
      }
      if (taskRoute[2] && request.method === 'PATCH') {
        if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) {
          return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        }
        const taskId = Number(taskRoute[2]);
        const body = await readJson(request);
        if (typeof body.title === 'string') {
          const title = body.title.trim();
          if (!title) return sendJson(response, 400, { error: 'Task title is required' });
          const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
          if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
          const task = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?').get(taskId);
          return sendJson(response, 200, { ...task, completed: Boolean(task.completed) });
        }
        if (typeof body.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
        const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, projectId, completed: body.completed });
      }
      return sendJson(response, 405, { error: 'Method not allowed' });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });

    const relativePath = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
      ? 'index.html'
      : url.pathname.replace(/^\//, '');
    const filePath = join(root, 'public', relativePath);
    if (!filePath.startsWith(join(root, 'public'))) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(response, 400, { error: 'Invalid JSON' });
    if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found' });
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
