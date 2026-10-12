import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
const { mkdir } = await import('node:fs/promises');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);
// Remember each task's slot in every project it has visited. Seed the current
// order once so existing tasks keep their positions when this feature is added.
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, rowid)
  FROM tasks`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted = 0 AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted = 0) AS totalCount
      FROM projects p ORDER BY p.created_at, p.rowid`).all());
  }
  const projectArchive = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (req.method === 'PATCH' && projectArchive) {
    let projectId;
    try { projectId = decodeURIComponent(projectArchive[1]); } catch { return send(res, 400, { error: 'Invalid project id' }); }
    let body = '';
    for await (const chunk of req) body += chunk;
    let archived;
    try { archived = JSON.parse(body).archived; } catch { return send(res, 400, { error: 'Invalid request' }); }
    if (typeof archived !== 'boolean') return send(res, 400, { error: 'Invalid archive state' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, projectId);
    if (!result.changes) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, { id: projectId, archived: archived ? 1 : 0 });
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'PATCH' && projectRoute) {
    let projectId;
    try { projectId = decodeURIComponent(projectRoute[1]); } catch { return send(res, 400, { error: 'Invalid project id' }); }
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid request' }); }
    if (typeof payload.defaultPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(payload.defaultPriority)) return send(res, 400, { error: 'Invalid default task priority' });
      const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(payload.defaultPriority, projectId);
      if (!result.changes) {
        const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        return send(res, existing ? 409 : 404, { error: existing ? 'Archived projects are read only' : 'Project not found' });
      }
      return send(res, 200, { id: projectId, defaultPriority: payload.defaultPriority });
    }
    let name = payload.name;
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, projectId);
    if (!result.changes) {
      const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      return send(res, existing ? 409 : 404, { error: existing ? 'Archived projects cannot be renamed' : 'Project not found' });
    }
    return send(res, 200, { id: projectId, name });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return send(res, 400, { error: 'Invalid request' }); }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
    return send(res, 201, project);
  }
  const projectTasks = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (projectTasks) {
    let projectId;
    try { projectId = decodeURIComponent(projectTasks[1]); } catch { return send(res, 400, { error: 'Invalid project id' }); }
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      return send(res, 200, db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
        FROM tasks t LEFT JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
        WHERE t.project_id = ? ORDER BY COALESCE(p.position, t.created_at), t.created_at, t.rowid`).all(projectId));
    }
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let title;
      try { title = JSON.parse(body).title; } catch { return send(res, 400, { error: 'Invalid request' }); }
      title = typeof title === 'string' ? title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const priority = db.prepare('SELECT default_priority FROM projects WHERE id = ?').get(projectId).default_priority;
      const task = { id: randomUUID(), projectId, title, completed: 0, priority };
      const createdAt = Math.max(Date.now(), db.prepare('SELECT COALESCE(MAX(created_at), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(projectId).value);
      db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)').run(task.id, projectId, title, createdAt, task.priority);
      const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
      db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(task.id, projectId, nextPosition);
      return send(res, 201, task);
    }
  }
  const taskCompletion = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  const taskDeletion = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/(delete|restore)$/);
  if (req.method === 'PATCH' && taskDeletion) {
    let projectId, taskId;
    try { projectId = decodeURIComponent(taskDeletion[1]); taskId = decodeURIComponent(taskDeletion[2]); } catch { return send(res, 400, { error: 'Invalid task id' }); }
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, { error: 'Project not found' });
    if (project.archived) return send(res, 409, { error: 'Archived projects are read only' });
    const deleted = taskDeletion[3] === 'delete' ? 1 : 0;
    const result = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(deleted, taskId, projectId);
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { id: taskId, projectId, deleted });
  }
  const taskMove = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (req.method === 'PATCH' && taskMove) {
    let sourceId, taskId;
    try { sourceId = decodeURIComponent(taskMove[1]); taskId = decodeURIComponent(taskMove[2]); } catch { return send(res, 400, { error: 'Invalid task id' }); }
    let payload;
    try { let body = ''; for await (const chunk of req) body += chunk; payload = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid request' }); }
    const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
    if (!source) return send(res, 404, { error: 'Project not found' });
    if (source.archived) return send(res, 409, { error: 'Archived projects are read only' });
    const destinationId = payload.destinationProjectId;
    const destination = typeof destinationId === 'string' && db.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    if (!destination || destination.archived || destinationId === sourceId) return send(res, 400, { error: 'Invalid destination project' });
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ? AND deleted = 0').get(taskId, sourceId);
    if (!task) return send(res, 404, { error: 'Task not found' });
    const remembered = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
    const nextPosition = remembered?.position ?? db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value;
    db.exec('BEGIN');
    try {
      if (!remembered) db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, destinationId, nextPosition);
      db.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?').run(destinationId, taskId, sourceId);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return send(res, 200, { id: taskId, projectId: destinationId });
  }
  if (req.method === 'PATCH' && taskCompletion) {
    let projectId, taskId;
    try { projectId = decodeURIComponent(taskCompletion[1]); taskId = decodeURIComponent(taskCompletion[2]); } catch { return send(res, 400, { error: 'Invalid task id' }); }
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid request' }); }
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, { error: 'Project not found' });
    if (project.archived) return send(res, 409, { error: 'Archived projects are read only' });
    if (typeof payload.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) return send(res, 400, { error: 'Invalid task priority' });
      const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(payload.priority, taskId, projectId);
      if (!result.changes) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, { id: taskId, projectId, priority: payload.priority });
    }
    if (Object.hasOwn(payload, 'dueDate')) {
      let dueDate = payload.dueDate;
      if (typeof dueDate !== 'string') return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      dueDate = dueDate.trim();
      if (dueDate !== '') {
        const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
          return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
      } else dueDate = null;
      const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate, taskId, projectId);
      if (!result.changes) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, { id: taskId, projectId, dueDate });
    }
    if (Object.hasOwn(payload, 'notes')) {
      if (typeof payload.notes !== 'string') return send(res, 400, { error: 'Notes must be text' });
      const result = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?').run(payload.notes, taskId, projectId);
      if (!result.changes) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, { id: taskId, projectId, notes: payload.notes });
    }
    if (typeof payload.title === 'string') {
      const title = payload.title.trim();
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
      if (!result.changes) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, { id: taskId, projectId, title });
    }
    const completed = payload.completed;
    if (typeof completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { id: taskId, projectId, completed: completed ? 1 : 0 });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application page unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && /^\/projects\/[^/]+$/.test(url.pathname)) {
    return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
