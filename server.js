import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE projects ADD COLUMN renamed_at INTEGER'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const html = await readFile(new URL('./index.html', import.meta.url));
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
async function bodyJson(req) { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, db.prepare('SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority, COUNT(t.id) AS total, COALESCE(SUM(t.completed),0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.created_at,p.rowid').all().map(p => ({ ...p, archived: Boolean(p.archived) })));
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameMatch) {
    const id = decodeURIComponent(renameMatch[1]);
    try {
      const body = await bodyJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name=?, renamed_at=? WHERE id=? AND archived=0').run(name, Date.now(), id);
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Active project not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (req.method === 'PATCH' && defaultPriorityMatch) {
    try {
      const body = await bodyJson(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(res, 400, { error: 'Invalid default task priority' });
      const result = db.prepare('UPDATE projects SET default_priority=? WHERE id=? AND archived=0').run(body.priority, decodeURIComponent(defaultPriorityMatch[1]));
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Active project not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) { const result = db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archiveMatch[2] === 'archive' ? 1 : 0, decodeURIComponent(archiveMatch[1])); return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Project not found' }); }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try { const body = await bodyJson(req); const name = typeof body.name === 'string' ? body.name.trim() : ''; if (!name) return sendJson(res, 400, { error: 'Project name is required' }); const project = { id: randomUUID(), name }; db.prepare('INSERT INTO projects (id,name,created_at) VALUES (?,?,?)').run(project.id, name, Date.now()); return sendJson(res, 201, project); }
    catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id=? ORDER BY created_at,rowid').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (req.method === 'POST') {
      if (db.prepare('SELECT archived FROM projects WHERE id=?').get(projectId).archived) return sendJson(res, 403, { error: 'Archived project' });
      try { const body = await bodyJson(req); const title = typeof body.title === 'string' ? body.title.trim() : ''; if (!title) return sendJson(res, 400, { error: 'Task title is required' }); const priority = db.prepare('SELECT default_priority FROM projects WHERE id=?').get(projectId).default_priority; const task = { id: randomUUID(), projectId, title, completed: false, priority }; db.prepare('INSERT INTO tasks (id,project_id,title,priority,created_at) VALUES (?,?,?,?,?)').run(task.id, projectId, title, priority, Date.now()); return sendJson(res, 201, task); }
      catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/rename$/);
  if (req.method === 'POST' && taskRenameMatch) {
    try {
      const body = await bodyJson(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = db.prepare('UPDATE tasks SET title=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(title, decodeURIComponent(taskRenameMatch[1]));
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Active task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const priorityMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/priority$/);
  if (req.method === 'PATCH' && priorityMatch) {
    try {
      const body = await bodyJson(req);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      const result = db.prepare('UPDATE tasks SET priority=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(body.priority, decodeURIComponent(priorityMatch[1]));
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const dueDateMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/due-date$/);
  if (req.method === 'PATCH' && dueDateMatch) {
    try {
      const body = await bodyJson(req);
      const rawDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
      let dueDate = null;
      if (rawDate) {
        const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const [, yearText, monthText, dayText] = match;
        const year = Number(yearText), month = Number(monthText), day = Number(dayText);
        const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        dueDate = rawDate;
      }
      const result = db.prepare('UPDATE tasks SET due_date=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(dueDate, decodeURIComponent(dueDateMatch[1]));
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Active task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const moveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/move$/);
  if (req.method === 'POST' && moveMatch) {
    try {
      const body = await bodyJson(req);
      const taskId = decodeURIComponent(moveMatch[1]);
      const destinationId = String(body.projectId || '');
      const task = db.prepare('SELECT t.project_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.archived=0').get(taskId);
      const destination = db.prepare('SELECT id FROM projects WHERE id=? AND archived=0').get(destinationId);
      if (!task || !destination || task.project_id === destinationId) return sendJson(res, 400, { error: 'Invalid move destination' });
      const nextOrder = (db.prepare('SELECT COALESCE(MAX(created_at),0)+1 AS value FROM tasks WHERE project_id=?').get(destinationId)).value;
      db.prepare('UPDATE tasks SET project_id=?, created_at=? WHERE id=?').run(destinationId, nextOrder, taskId);
      return sendJson(res, 200, { ok: true });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try { const body = await bodyJson(req); const result = db.prepare('UPDATE tasks SET completed=? WHERE id=? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(body.completed ? 1 : 0, decodeURIComponent(taskMatch[1])); if (!result.changes) return sendJson(res, 404, { error: 'Task not found' }); return sendJson(res, 200, { ok: true }); }
    catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+$/.test(url.pathname))) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
