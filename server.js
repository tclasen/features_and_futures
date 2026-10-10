import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal'
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal',
  due_date TEXT
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const sendJson = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  try {
    if (url.pathname === '/health' && req.method === 'GET') return sendJson(200, { status: 'ok' });
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      return sendJson(200, db.prepare(`SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
        FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id ORDER BY p.id`).all().map(p => ({ ...p, archived: Boolean(p.archived) })));
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(201, { id: Number(result.lastInsertRowid), name });
    }
    const detail = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (detail && req.method === 'GET') {
      const project = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(detail[1]));
      if (project) project.archived = Boolean(project.archived);
      return project ? sendJson(200, project) : sendJson(404, { error: 'Project not found' });
    }
    const renamePath = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
    if (renamePath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renamePath[1]));
      return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Project not found or archived' });
    }
    const defaultPath = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
    if (defaultPath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) return sendJson(400, { error: 'Invalid task priority' });
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(payload.priority, Number(defaultPath[1]));
      return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Project not found or archived' });
    }
    const archivePath = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
    if (archivePath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      if (typeof payload.archived !== 'boolean') return sendJson(400, { error: 'Invalid archive state' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(payload.archived ? 1 : 0, Number(archivePath[1]));
      return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Project not found' });
    }
    const tasksPath = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (tasksPath && req.method === 'GET') {
      const projectId = Number(tasksPath[1]);
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(404, { error: 'Project not found' });
      return sendJson(200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (tasksPath && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(400, { error: 'Task title is required' });
      const projectId = Number(tasksPath[1]);
      const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(404, { error: 'Project not found' });
      if (project.archived) return sendJson(404, { error: 'Project is archived' });
      const priority = project.default_priority;
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, priority);
      return sendJson(201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority });
    }
    const movePath = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
    if (movePath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const taskId = Number(movePath[1]);
      const destinationId = Number(payload.projectId);
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      const destination = db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(destinationId);
      const source = task && db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(task.project_id);
      if (!task || !destination || !source || task.project_id === destinationId) return sendJson(400, { error: 'Invalid task destination' });
      db.exec('BEGIN');
      try {
        const inserted = db.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES (?, ?, ?, ?, ?)').run(destinationId, task.title, task.completed, task.priority, task.due_date);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
        db.exec('COMMIT');
        return sendJson(200, { ok: true, id: Number(inserted.lastInsertRowid) });
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const dueDatePath = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
    if (dueDatePath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      if (typeof payload.dueDate !== 'string') return sendJson(400, { error: 'Invalid due date' });
      const dueDate = payload.dueDate.trim();
      if (dueDate && !validDate(dueDate)) return sendJson(400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const result = db.prepare(`UPDATE tasks SET due_date = ? WHERE id = ? AND EXISTS
        (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`).run(dueDate || null, Number(dueDatePath[1]));
      return result.changes ? sendJson(200, { ok: true, dueDate: dueDate || null }) : sendJson(404, { error: 'Task not found or project archived' });
    }
    const taskRenamePath = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
    if (taskRenamePath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(400, { error: 'Task title is required' });
      const result = db.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND EXISTS
        (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`).run(title, Number(taskRenamePath[1]));
      return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Task not found or project archived' });
    }
    const taskPath = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (taskPath && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      if (typeof payload.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(payload.priority)) return sendJson(400, { error: 'Invalid task priority' });
        const result = db.prepare(`UPDATE tasks SET priority = ? WHERE id = ? AND EXISTS
          (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`).run(payload.priority, Number(taskPath[1]));
        return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Task not found or project archived' });
      }
      if (typeof payload.completed !== 'boolean') return sendJson(400, { error: 'Invalid completion state' });
      const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND EXISTS
        (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`).run(payload.completed ? 1 : 0, Number(taskPath[1]));
      return result.changes ? sendJson(200, { ok: true }) : sendJson(404, { error: 'Task not found' });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(404, { error: 'Not found' });
    const html = await readFile(path.join(root, 'public', 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    console.error(error);
    sendJson(500, { error: 'Internal server error' });
  }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
