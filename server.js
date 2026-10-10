import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER NOT NULL DEFAULT 0
)`);
// Upgrade databases created before project archiving was introduced.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!projectColumns.some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
if (!taskColumns.some(column => column.name === 'due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!taskColumns.some(column => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET sort_order = id');
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id ASC`).all().map(p => ({ ...p, archived: !!p.archived, summary: `${p.completed_count}/${p.total_count} completed` })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && req.method === 'POST') {
    const changed = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return changed.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameMatch[1]));
      return result.changes ? send(res, 200, { ok: true, name }) : send(res, 404, { error: 'Project not found or archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskListMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskListMatch && req.method === 'GET') {
    const projectId = Number(taskListMatch[1]);
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId).map(t => ({ ...t, completed: !!t.completed })));
  }
  if (taskListMatch && req.method === 'POST') {
    try {
      const projectId = Number(taskListMatch[1]);
      const owner = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!owner) return send(res, 404, { error: 'Project not found' });
      if (owner.archived) return send(res, 403, { error: 'Archived projects cannot have tasks' });
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const priority = ['Low', 'Normal', 'High'].includes(body.priority) ? body.priority : owner.default_priority;
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next;
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, priority, order);
      return send(res, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const taskId = Number(moveMatch[1]), destinationId = Number(body.destination_id);
      const task = db.prepare('SELECT t.project_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.archived = 0').get(taskId);
      const destination = db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(destinationId);
      if (!task || !destination || task.project_id === destinationId) return send(res, 400, { error: 'Invalid move' });
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(destinationId).next;
      db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ?').run(destinationId, order, taskId);
      return send(res, 200, { ok: true });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const dueDateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
  if (dueDateMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      const raw = typeof body.due_date === 'string' ? body.due_date.trim() : '';
      let dueDate = null;
      if (raw) {
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const candidate = new Date(0);
        candidate.setUTCHours(0, 0, 0, 0);
        candidate.setUTCFullYear(year, month - 1, day);
        if (year < 1 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day)
          return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        dueDate = raw;
      }
      const result = db.prepare(`UPDATE tasks SET due_date = ? WHERE id = ? AND project_id IN
        (SELECT id FROM projects WHERE archived = 0)`).run(dueDate, Number(dueDateMatch[1]));
      return result.changes ? send(res, 200, { ok: true, due_date: dueDate }) : send(res, 404, { error: 'Task not found or project archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (taskRenameMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND project_id IN
        (SELECT id FROM projects WHERE archived = 0)`).run(title, Number(taskRenameMatch[1]));
      return result.changes ? send(res, 200, { ok: true, title }) : send(res, 404, { error: 'Task not found or project archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      let result;
      if (typeof body.completed === 'boolean') {
        result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN
          (SELECT id FROM projects WHERE archived = 0)`).run(body.completed ? 1 : 0, Number(taskMatch[1]));
      } else if (['Low', 'Normal', 'High'].includes(body.priority)) {
        result = db.prepare(`UPDATE tasks SET priority = ? WHERE id = ? AND project_id IN
          (SELECT id FROM projects WHERE archived = 0)`).run(body.priority, Number(taskMatch[1]));
      } else return send(res, 400, { error: 'Invalid task update' });
      return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Task not found' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const defaultMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultMatch && req.method === 'PATCH') {
    try {
      const body = await readBody(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return send(res, 400, { error: 'Invalid priority' });
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(body.priority, Number(defaultMatch[1]));
      return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Project not found or archived' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (url.pathname === '/api/active-projects' && req.method === 'GET') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects WHERE archived = 0 ORDER BY id ASC').all());
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, { ...project, archived: !!project.archived }) : send(res, 404, { error: 'Project not found' });
  }
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (req.method === 'GET') {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = ['app.js', 'style.css'].includes(requested) ? requested : 'index.html';
    try {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(join(root, 'public', path));
      const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type }); return res.end(content);
    } catch { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
