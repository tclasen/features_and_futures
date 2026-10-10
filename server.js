import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
  CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT);
`);
db.exec('PRAGMA foreign_keys = ON');
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!db.prepare("PRAGMA table_info(tasks)").all().some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
if (!db.prepare("PRAGMA table_info(tasks)").all().some(column => column.name === 'due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!db.prepare("PRAGMA table_info(tasks)").all().some(column => column.name === 'sort_order')) { db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER'); db.exec('UPDATE tasks SET sort_order = id'); }
db.exec(`CREATE TABLE IF NOT EXISTS task_project_order (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY(task_id, project_id)
)`);
// Seed remembered positions from the existing per-project ordering on upgrade.
db.exec(`INSERT OR IGNORE INTO task_project_order (task_id, project_id, position)
  SELECT id, project_id, sort_order FROM tasks`);
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
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const readBody = async () => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body); };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`).all().map(p => ({...p, archived: Boolean(p.archived)})));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try { const name = String((await readBody()).name ?? '').trim(); if (!name) return send(400, { error: 'Project name is required' }); const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name); return send(201, { id: Number(result.lastInsertRowid), name }); }
    catch { return send(400, { error: 'Invalid request' }); }
  }
  const projectRename = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRename && req.method === 'PATCH') {
    try {
      const name = String((await readBody()).name ?? '').trim();
      if (!name) return send(400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(projectRename[1]));
      return result.changes ? send(200, { ok: true, name }) : send(404, { error: 'Project not found or archived' });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  const projectDefault = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (projectDefault && req.method === 'PATCH') {
    try {
      const { priority } = await readBody();
      if (!['Low', 'Normal', 'High'].includes(priority)) return send(400, {error:'Invalid task priority'});
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(priority, Number(projectDefault[1]));
      return result.changes ? send(200, {ok:true, priority}) : send(404, {error:'Project not found'});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  const projectArchive = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectArchive && req.method === 'PATCH') {
    try { const { archived } = await readBody(); const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, Number(projectArchive[1])); return result.changes ? send(200, {ok:true}) : send(404, {error:'Project not found'}); }
    catch { return send(400, {error:'Invalid request'}); }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') return send(200, db.prepare(`SELECT t.id, t.title, t.completed, t.priority, t.due_date FROM tasks t LEFT JOIN task_project_order o ON o.task_id = t.id AND o.project_id = t.project_id WHERE t.project_id = ? ORDER BY COALESCE(o.position, t.sort_order), t.id`).all(Number(taskRoute[1])).map(task => ({...task, completed: Boolean(task.completed)})));
  if (taskRoute && req.method === 'POST') {
    try {
      const projectId = Number(taskRoute[1]);
      const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(404, {error:'Project not found'});
      if (project.archived) return send(403, {error:'Archived project'});
      const title = String((await readBody()).title ?? '').trim();
      if (!title) return send(400, {error:'Task title is required'});
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tasks WHERE project_id = ?').get(projectId).n;
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_priority, order);
      db.prepare('INSERT INTO task_project_order (task_id, project_id, position) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), projectId, order);
      return send(201, {id:Number(result.lastInsertRowid), title, completed:false});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  const taskMove = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (taskMove && req.method === 'POST') {
    try {
      const sourceId = Number(taskMove[1]), taskId = Number(taskMove[2]), { destinationId } = await readBody();
      const destination = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(Number(destinationId));
      const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
      if (!source || source.archived || !destination || destination.archived || sourceId === Number(destinationId)) return send(400, {error:'Invalid destination project'});
      const destinationProjectId = Number(destinationId);
      const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
      if (!task) return send(404, {error:'Task not found'});
      let remembered = db.prepare('SELECT position FROM task_project_order WHERE task_id = ? AND project_id = ?').get(taskId, destinationProjectId);
      if (!remembered) {
        const order = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM task_project_order WHERE project_id = ?').get(destinationProjectId).n;
        db.prepare('INSERT INTO task_project_order (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, destinationProjectId, order);
        remembered = { position: order };
      }
      const result = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationProjectId, remembered.position, taskId, sourceId);
      return result.changes ? send(200, {ok:true}) : send(404, {error:'Task not found'});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  const taskUpdate = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      const body = await readBody();
      const projectId = Number(taskUpdate[1]), taskId = Number(taskUpdate[2]);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(404, {error:'Project not found'});
      if (project.archived) return send(403, {error:'Archived project'});
      if (Object.hasOwn(body, 'dueDate')) {
        const dueDate = String(body.dueDate ?? '').trim();
        if (dueDate && !validDate(dueDate)) return send(400, {error:'Due date must be a valid YYYY-MM-DD date'});
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?').run(dueDate || null, projectId, taskId);
        return result.changes ? send(200, {ok:true, dueDate:dueDate || null}) : send(404, {error:'Task not found'});
      }
      if (Object.hasOwn(body, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) return send(400, {error:'Invalid task priority'});
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?').run(body.priority, projectId, taskId);
        return result.changes ? send(200, {ok:true, priority:body.priority}) : send(404, {error:'Task not found'});
      }
      if (Object.hasOwn(body, 'title')) {
        const title = String(body.title ?? '').trim();
        if (!title) return send(400, {error:'Task title is required'});
        const result = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?').run(title, projectId, taskId);
        return result.changes ? send(200, {ok:true, title}) : send(404, {error:'Task not found'});
      }
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?').run(body.completed ? 1 : 0, projectId, taskId);
      return result.changes ? send(200, {ok:true}) : send(404, {error:'Task not found'});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  if (url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
  if (req.method !== 'GET' || (url.pathname !== '/' && !/^\/projects\/[^/]+\/?$/.test(url.pathname))) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await (await import('node:fs/promises')).readFile(join(root, 'index.html')));
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
