import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Existing databases from earlier checkpoints need the archive state too.
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const page = await readFile(new URL('./index.html', import.meta.url));

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    return sendJson(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
      FROM projects p WHERE p.archived = ? ORDER BY p.id`).all(archived));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let data;
    try { data = await readJson(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (req.method === 'POST' && renameMatch) {
    let data;
    try { data = await readJson(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameMatch[1]));
    if (!result.changes) {
      const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(Number(renameMatch[1]));
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      return sendJson(res, 409, { error: 'Archived project' });
    }
    return sendJson(res, 200, { name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      return sendJson(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId));
    }
    if (req.method === 'POST') {
      if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
      let data;
      try { data = await readJson(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), title, completed: 0 });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (req.method === 'POST' && taskRenameMatch) {
    let data;
    try { data = await readJson(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const taskId = Number(taskRenameMatch[1]);
    const task = db.prepare('SELECT t.id, p.archived FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?').get(taskId);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    if (task.archived) return sendJson(res, 409, { error: 'Archived project' });
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, taskId);
    return sendJson(res, 200, { title });
  }
  if (req.method === 'PATCH' && taskMatch) {
    let data;
    try { data = await readJson(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    if (typeof data.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Task not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  sendJson(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
