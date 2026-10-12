import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
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
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);`);
// Upgrade databases created by earlier checkpoints.
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
db.exec(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT t.id, t.project_id, ROW_NUMBER() OVER (PARTITION BY t.project_id ORDER BY t.id)
  FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM task_positions tp WHERE tp.task_id = t.id AND tp.project_id = t.project_id)`);
const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (url.pathname === '/health' && req.method === 'GET') return send(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, 'application/json; charset=utf-8', JSON.stringify(db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`).all().map(p => ({ ...p, archived: Boolean(p.archived) }))));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, 'application/json; charset=utf-8', JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const tasks = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasks && req.method === 'GET') {
    const projectId = Number(tasks[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
    return send(200, 'application/json; charset=utf-8', JSON.stringify(db.prepare('SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes FROM tasks t JOIN task_positions tp ON tp.task_id = t.id AND tp.project_id = t.project_id WHERE t.project_id = ? ORDER BY tp.position, t.id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
  }
  if (tasks && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const projectId = Number(tasks[1]);
      const owner = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!owner) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
      if (owner.archived) return send(409, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, owner.default_priority);
      const taskId = Number(result.lastInsertRowid);
      const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM task_positions WHERE project_id = ?').get(projectId).next;
      db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, projectId, position);
      return send(201, 'application/json; charset=utf-8', JSON.stringify({ id: taskId, projectId, title, completed: false }));
    } catch { return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' })); }
  }
  const project = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (project && req.method === 'PATCH') {
    let body = ''; for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const id = Number(project[1]);
      if (data.defaultPriority !== undefined) {
        if (!['Low', 'Normal', 'High'].includes(data.defaultPriority)) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid priority' }));
        const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(data.defaultPriority, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      }
      if (typeof data.name === 'string') {
        const name = data.name.trim();
        if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
        const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, name }));
      }
      if (typeof data.archived !== 'boolean') return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(data.archived ? 1 : 0, id);
      if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
    } catch { return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' })); }
  }
  const task = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (task && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const id = Number(task[1]);
      if (Object.hasOwn(data, 'projectId')) {
        const destinationId = Number(data.projectId);
        if (!Number.isSafeInteger(destinationId) || destinationId <= 0) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid destination' }));
        const current = db.prepare('SELECT t.project_id, s.archived AS source_archived, d.archived AS destination_archived FROM tasks t JOIN projects s ON s.id = t.project_id JOIN projects d ON d.id = ? WHERE t.id = ?').get(destinationId, id);
        if (!current || current.source_archived || current.destination_archived || current.project_id === destinationId) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid destination' }));
        let remembered = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?').get(id, destinationId);
        if (!remembered) {
          const next = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM task_positions WHERE project_id = ?').get(destinationId).next;
          db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(id, destinationId, next);
        }
        db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?').run(destinationId, id);
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      }
      if (typeof data.notes === 'string') {
        const result = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(data.notes, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      }
      if (Object.hasOwn(data, 'dueDate')) {
        const raw = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
        let dueDate = raw || null;
        if (dueDate !== null) {
          const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!match) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
          const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
          const date = new Date(0);
          date.setUTCHours(0, 0, 0, 0);
          date.setUTCFullYear(year, month - 1, day);
          if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        }
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(dueDate, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, dueDate }));
      }
      if (typeof data.title === 'string') {
        const title = data.title.trim();
        if (!title) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(title, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, title }));
      }
      if (data.priority !== undefined) {
        if (!['Low', 'Normal', 'High'].includes(data.priority)) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid priority' }));
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(data.priority, id);
        if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      }
      if (typeof data.completed !== 'boolean') return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(data.completed ? 1 : 0, id);
      if (!result.changes) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
    } catch { return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' })); }
  }
  if (project && req.method === 'GET') {
    const item = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(project[1]));
    return item ? send(200, 'application/json; charset=utf-8', JSON.stringify({ ...item, archived: Boolean(item.archived) })) : send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    const { readFile } = await import('node:fs/promises');
    return send(200, 'text/html; charset=utf-8', await readFile(indexPath));
  }
  send(404, 'text/plain; charset=utf-8', 'Not found');
});
server.listen(port, '0.0.0.0');
