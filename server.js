import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (task_id TEXT NOT NULL, project_id TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id))`);
// Preserve each task's existing order as its initial position in its current project.
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
 SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, rowid)
 FROM tasks`);
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const getProjects = db.prepare(`SELECT p.id, p.name, p.archived, COALESCE(SUM(CASE WHEN t.deleted = 0 AND t.completed = 1 THEN 1 ELSE 0 END), 0) AS completed, COALESCE(SUM(CASE WHEN t.deleted = 0 THEN 1 ELSE 0 END), 0) AS total FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const getTasks = db.prepare('SELECT t.id, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted FROM tasks t JOIN task_project_positions pos ON pos.task_id = t.id AND pos.project_id = t.project_id WHERE t.project_id = ? ORDER BY pos.position, t.created_at, t.rowid');
const exportProject = db.prepare('SELECT name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const exportTasks = db.prepare('SELECT title, completed, priority, COALESCE(due_date, \'\') AS dueDate, COALESCE(notes, \'\') AS notes, deleted FROM tasks t JOIN task_project_positions pos ON pos.task_id = t.id AND pos.project_id = t.project_id WHERE t.project_id = ? ORDER BY pos.position, t.created_at, t.rowid');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const addTaskPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');
const getTaskPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const addTaskPositionAtEnd = db.prepare('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position) SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?');

const page = await readFile(new URL('./public/index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && url.pathname === '/health') return json(200, { status: 'ok' });
  const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (req.method === 'GET' && exportMatch) {
    const id = decodeURIComponent(exportMatch[1]);
    const project = exportProject.get(id);
    if (!project) return json(404, { error: 'Not found' });
    return json(200, { format: 'workboard-project', version: 1, project: { name: project.name, archived: Boolean(project.archived), defaultPriority: project.defaultPriority, tasks: exportTasks.all(id).map(t => ({ title: t.title, completed: Boolean(t.completed), priority: t.priority || 'Normal', dueDate: t.dueDate || '', notes: String(t.notes || '').replace(/\r\n?/g, '\n'), deleted: Boolean(t.deleted) })) } });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(200, getProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const id = decodeURIComponent(archiveMatch[1]);
    if (!getProject.get(id)) return json(404, { error: 'Not found' });
    setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
    return json(200, { status: 'ok' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects/import') {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid project JSON' }); }
    const invalid = () => json(400, { error: 'Invalid project JSON' });
    const doc = body?.document;
    const validDate = value => {
      if (value === '') return true;
      const m = typeof value === 'string' && value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
      if (!m) return false;
      const y = +m[1], month = +m[2], day = +m[3], leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return y >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= lengths[month - 1];
    };
    const pr = doc?.project;
    if (doc?.format !== 'workboard-project' || doc.version !== 1 || !pr || typeof pr !== 'object' || typeof pr.name !== 'string' || !pr.name.trim() || typeof pr.archived !== 'boolean' || !['Low','Normal','High'].includes(pr.defaultPriority) || !Array.isArray(pr.tasks) || pr.tasks.some(t => !t || typeof t !== 'object' || typeof t.title !== 'string' || !t.title.trim() || typeof t.completed !== 'boolean' || !['Low','Normal','High'].includes(t.priority) || typeof t.dueDate !== 'string' || !validDate(t.dueDate) || typeof t.notes !== 'string' || typeof t.deleted !== 'boolean')) return invalid();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(400, { error: 'Project name is required' });
    const id = randomUUID(), now = Date.now();
    try {
      db.exec('BEGIN');
      db.prepare('INSERT INTO projects (id,name,created_at,archived,default_priority) VALUES (?,?,?,?,?)').run(id,name,now,pr.archived ? 1 : 0,pr.defaultPriority);
      const add = db.prepare('INSERT INTO tasks (id,project_id,title,completed,created_at,priority,due_date,notes,deleted) VALUES (?,?,?,?,?,?,?,?,?)');
      const pos = db.prepare('INSERT INTO task_project_positions (task_id,project_id,position) VALUES (?,?,?)');
      pr.tasks.forEach((t,i) => { const taskId=randomUUID(); add.run(taskId,id,t.title,t.completed?1:0,now+i,t.priority,t.dueDate || null,t.notes.replace(/\r\n?/g,'\n'),t.deleted?1:0); pos.run(taskId,id,i+1); });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return json(201, { id });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = String(JSON.parse(body).name ?? '').trim(); } catch { return json(400, { error: 'Invalid request' }); }
    if (!name) return json(400, { error: 'Project name is required' });
    const id = randomUUID();
    insertProject.run(id, name, Date.now());
    return json(201, { id, name });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameMatch) {
    const id = decodeURIComponent(renameMatch[1]);
    const project = getProject.get(id);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const name = String(body.name ?? '').trim();
    if (!name) return json(400, { error: 'Project name is required' });
    renameProject.run(name, id);
    return json(200, { id, name });
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (req.method === 'PATCH' && defaultPriorityMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const id = decodeURIComponent(defaultPriorityMatch[1]);
    const project = getProject.get(id);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(400, { error: 'Invalid priority' });
    updateDefaultPriority.run(body.priority, id);
    return json(200, { status: 'ok' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(404, { error: 'Not found' });
    if (req.method === 'GET') return json(200, getTasks.all(projectId));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return json(403, { error: 'Archived project' });
      let body;
      try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
      const title = String(body.title ?? '').trim();
      if (!title) return json(400, { error: 'Task title is required' });
      const id = randomUUID();
      const priority = getProject.get(projectId).defaultPriority;
      insertTask.run(id, projectId, title, Date.now(), priority);
      addTaskPositionAtEnd.run(id, projectId, projectId);
      return json(201, { id, title, completed: 0, priority });
    }
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (req.method === 'POST' && moveMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const sourceId = decodeURIComponent(moveMatch[1]), taskId = decodeURIComponent(moveMatch[2]);
    const source = getProject.get(sourceId), destination = getProject.get(String(body.destinationId || ''));
    if (!source || !destination) return json(404, { error: 'Not found' });
    if (source.archived || destination.archived || sourceId === destination.id) return json(403, { error: 'Invalid destination' });
    const result = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
    if (!result) return json(404, { error: 'Not found' });
    // A remembered destination position is intentionally left untouched on return.
    addTaskPositionAtEnd.run(taskId, destination.id, destination.id);
    moveTask.run(destination.id, taskId, sourceId);
    return json(200, { status: 'ok' });
  }
  const deletionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/(delete|restore)$/);
  if (req.method === 'POST' && deletionMatch) {
    const projectId = decodeURIComponent(deletionMatch[1]), taskId = decodeURIComponent(deletionMatch[2]);
    const project = getProject.get(projectId);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    const result = setTaskDeleted.run(deletionMatch[3] === 'delete' ? 1 : 0, taskId, projectId);
    return result.changes ? json(200, { status: 'ok' }) : json(404, { error: 'Not found' });
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameTaskMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const projectId = decodeURIComponent(renameTaskMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    const title = String(body.title ?? '').trim();
    if (!title) return json(400, { error: 'Task title is required' });
    const result = renameTask.run(title, decodeURIComponent(renameTaskMatch[2]), projectId);
    return result.changes ? json(200, { status: 'ok', title }) : json(404, { error: 'Not found' });
  }
  const priorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/priority$/);
  if (req.method === 'PATCH' && priorityMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const projectId = decodeURIComponent(priorityMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    if (!['Low', 'Normal', 'High'].includes(body.priority)) return json(400, { error: 'Invalid priority' });
    const result = updatePriority.run(body.priority, decodeURIComponent(priorityMatch[2]), projectId);
    return result.changes ? json(200, { status: 'ok' }) : json(404, { error: 'Not found' });
  }
  const dueDateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/due-date$/);
  if (req.method === 'PATCH' && dueDateMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const projectId = decodeURIComponent(dueDateMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    const value = String(body.dueDate ?? '').trim();
    let date = null;
    if (value) {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return json(400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const [, y, m, d] = match, year = Number(y), month = Number(m), day = Number(d);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) return json(400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      date = value;
    }
    const result = updateDueDate.run(date, decodeURIComponent(dueDateMatch[2]), projectId);
    return result.changes ? json(200, { status: 'ok', dueDate: date }) : json(404, { error: 'Not found' });
  }
  const notesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/notes$/);
  if (req.method === 'PATCH' && notesMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const projectId = decodeURIComponent(notesMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    if (typeof body.notes !== 'string') return json(400, { error: 'Invalid notes' });
    const result = updateNotes.run(body.notes, decodeURIComponent(notesMatch[2]), projectId);
    return result.changes ? json(200, { status: 'ok', notes: body.notes }) : json(404, { error: 'Not found' });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const project = getProject.get(decodeURIComponent(taskMatch[1]));
    if (!project || project.archived) return json(403, { error: 'Archived project' });
    const result = updateTask.run(body.completed ? 1 : 0, decodeURIComponent(taskMatch[2]), decodeURIComponent(taskMatch[1]));
    return result.changes ? json(200, { status: 'ok' }) : json(404, { error: 'Not found' });
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const project = getProject.get(decodeURIComponent(match[1]));
    return project ? json(200, project) : json(404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
