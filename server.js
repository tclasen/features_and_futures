import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, task_order INTEGER NOT NULL DEFAULT 0);`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'task_order')) { db.exec('ALTER TABLE tasks ADD COLUMN task_order INTEGER NOT NULL DEFAULT 0'); db.exec('UPDATE tasks SET task_order=id'); }
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
db.exec('PRAGMA foreign_keys = ON');
function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const readBody = async () => { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Body too large'); } return JSON.parse(raw); };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, db.prepare('SELECT p.id, p.name, p.archived, COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id').all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try { const data = await readBody(); if (typeof data.name !== 'string' || !data.name.trim()) return send(400, { error: 'Project name is required' }); const name = data.name.trim(); const result = db.prepare('INSERT INTO projects(name) VALUES (?)').run(name); return send(201, { id: Number(result.lastInsertRowid), name }); } catch { return send(400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id=?').get(projectId);
    if (!project) return send(404, { error: 'Project not found' });
    if (req.method === 'GET') return send(200, db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id=? ORDER BY task_order, id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (req.method === 'POST') {
      if (project.archived) return send(409, { error: 'Archived project' });
      try { const data = await readBody(); if (typeof data.title !== 'string' || !data.title.trim()) return send(400, { error: 'Task title is required' }); const title = data.title.trim(); const order = db.prepare('SELECT COALESCE(MAX(task_order),0)+1 AS next FROM tasks WHERE project_id=?').get(projectId).next; const result = db.prepare('INSERT INTO tasks(project_id,title,priority,task_order) VALUES (?,?,?,?)').run(projectId, title, project.default_priority, order); return send(201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_priority }); } catch { return send(400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try {
      const data = await readBody();
      if (Object.hasOwn(data, 'due_date')) {
        if (typeof data.due_date !== 'string') return send(400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const value = data.due_date.trim();
        if (value && !isValidDate(value)) return send(400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const dueDate = value || null;
        const result = db.prepare('UPDATE tasks SET due_date=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(dueDate, Number(taskMatch[1]));
        if (result.changes) return send(200, { due_date: dueDate });
        const task = db.prepare('SELECT t.id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?').get(Number(taskMatch[1]));
        return task ? send(409, { error: 'Archived project' }) : send(404, { error: 'Task not found' });
      }
      if (typeof data.title === 'string') {
        if (!data.title.trim()) return send(400, { error: 'Task title is required' });
        const title = data.title.trim();
        const result = db.prepare('UPDATE tasks SET title=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(title, Number(taskMatch[1]));
        if (result.changes) return send(200, { title });
        const task = db.prepare('SELECT t.id, p.archived FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?').get(Number(taskMatch[1]));
        return task ? send(409, { error: 'Archived project' }) : send(404, { error: 'Task not found' });
      }
      if (typeof data.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(data.priority)) return send(400, { error: 'Invalid priority' });
        const result = db.prepare('UPDATE tasks SET priority=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(data.priority, Number(taskMatch[1]));
        if (result.changes) return send(200, { priority: data.priority });
        const task = db.prepare('SELECT t.id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?').get(Number(taskMatch[1]));
        return task ? send(409, { error: 'Archived project' }) : send(404, { error: 'Task not found' });
      }
      if (typeof data.completed !== 'boolean') return send(400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(data.completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? send(200, { completed: data.completed }) : send(404, { error: 'Task not found' });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (req.method === 'POST' && moveMatch) {
    try {
      const data = await readBody();
      const destinationId = Number(data.destination_project_id);
      const task = db.prepare('SELECT t.id, t.project_id, p.archived FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?').get(Number(moveMatch[1]));
      const destination = db.prepare('SELECT id, archived FROM projects WHERE id=?').get(destinationId);
      if (!task || !destination) return send(404, { error: 'Task or project not found' });
      if (task.archived || destination.archived || task.project_id === destinationId) return send(409, { error: 'Invalid move' });
      const order = db.prepare('SELECT COALESCE(MAX(task_order),0)+1 AS next FROM tasks WHERE project_id=?').get(destinationId).next;
      db.prepare('UPDATE tasks SET project_id=?, task_order=? WHERE id=?').run(destinationId, order, task.id);
      return send(200, { status: 'ok' });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const result = db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? send(200, { status: 'ok' }) : send(404, { error: 'Project not found' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      const data = await readBody();
      if (typeof data.default_priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(data.default_priority)) return send(400, { error: 'Invalid priority' });
        const result = db.prepare('UPDATE projects SET default_priority=? WHERE id=? AND archived=0').run(data.default_priority, Number(projectMatch[1]));
        if (result.changes) return send(200, { default_priority: data.default_priority });
        const project = db.prepare('SELECT id FROM projects WHERE id=?').get(Number(projectMatch[1]));
        return project ? send(409, { error: 'Archived project' }) : send(404, { error: 'Project not found' });
      }
      if (typeof data.name !== 'string' || !data.name.trim()) return send(400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name=? WHERE id=? AND archived=0').run(data.name.trim(), Number(projectMatch[1]));
      if (result.changes) return send(200, { name: data.name.trim() });
      const project = db.prepare('SELECT id FROM projects WHERE id=?').get(Number(projectMatch[1]));
      return project ? send(409, { error: 'Archived project' }) : send(404, { error: 'Project not found' });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && projectMatch) { const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id=?').get(Number(projectMatch[1])); return project ? send(200, { ...project, archived: Boolean(project.archived) }) : send(404, { error: 'Project not found' }); }
  if (req.method === 'GET') {
    const file = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname) ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..') || file.includes('\\')) return send(404, 'Not found', 'text/plain');
    try { return send(200, readFileSync(join(root, 'public', file)), mime[extname(file)] || 'application/octet-stream'); } catch { return send(404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
