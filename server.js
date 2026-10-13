import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
// Keep additive migrations explicit so every pre-existing database receives the
// persistence columns before request handlers prepare their statements.
const taskColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name));
if (!taskColumns.has('due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!taskColumns.has('notes')) db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
// Re-read schema after additive migrations before preparing persistence queries.
const migratedTaskColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name));
if (!migratedTaskColumns.has('due_date') || !migratedTaskColumns.has('notes')) {
  throw new Error('Task persistence schema migration failed');
}
if (!new Set(db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name)).has('deleted')) db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
try { db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec('UPDATE tasks SET sort_order = id WHERE sort_order = 0');
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, sort_order FROM tasks`);
const listTasks = db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
  FROM tasks t LEFT JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position, t.id`);
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE project_id = ?), 0))');
const addTaskPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const nextTaskPosition = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM task_project_positions WHERE project_id = ?');
const getTaskPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const getTaskDueDate = db.prepare('SELECT due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare("UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ? AND ? IN ('Low', 'Normal', 'High')");
const setDefaultPriority = db.prepare("UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0 AND ? IN ('Low', 'Normal', 'High')");
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1 AND t.deleted = 0) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted = 0) AS totalCount
  FROM projects p ORDER BY p.id`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const json = (res, status, value) => send(res, status, JSON.stringify(value));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, listProjects.all());
  }
  if (url.pathname === '/api/directory' && req.method === 'GET') {
    return json(res, 200, db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted, p.name AS projectName, p.archived AS projectArchived FROM tasks t JOIN projects p ON p.id=t.project_id ORDER BY p.id, (SELECT position FROM task_project_positions x WHERE x.task_id=t.id AND x.project_id=t.project_id), t.id`).all());
  }
  if (url.pathname === '/api/directory/bulk' && req.method === 'POST') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      if (!Array.isArray(data.ids) || typeof data.completed !== 'boolean') return json(res, 400, { error: 'Invalid request' });
      const update = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND deleted = 0 AND project_id IN (SELECT id FROM projects WHERE archived = 0)');
      db.exec('BEGIN');
      try { for (const id of data.ids) if (Number.isInteger(id)) update.run(data.completed ? 1 : 0, id); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      return json(res, 200, { status: 'ok' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  if (url.pathname === '/api/projects/import' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw || '{}');
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      let document;
      try { document = JSON.parse(input.document); } catch { return json(res, 400, { error: 'Invalid project JSON' }); }
      const validDate = value => {
        if (value === '') return true;
        if (typeof value !== 'string') return false;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3], leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
        return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
      };
      const p = document?.project;
      const priorities = ['Low', 'Normal', 'High'];
      if (document?.format !== 'workboard-project' || document.version !== 1 || !Number.isInteger(document.version) || !p || typeof p !== 'object' || Array.isArray(p) || typeof p.name !== 'string' || !p.name.trim() || typeof p.archived !== 'boolean' || !priorities.includes(p.defaultPriority) || !Array.isArray(p.tasks) || !p.tasks.every(t => t && typeof t === 'object' && !Array.isArray(t) && typeof t.title === 'string' && t.title.trim() && typeof t.completed === 'boolean' && priorities.includes(t.priority) && validDate(t.dueDate) && typeof t.notes === 'string' && typeof t.deleted === 'boolean')) return json(res, 400, { error: 'Invalid project JSON' });
      db.exec('BEGIN');
      try {
        createProject.run(name);
        const projectId = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
        db.prepare('UPDATE projects SET archived = ?, default_priority = ? WHERE id = ?').run(p.archived ? 1 : 0, p.defaultPriority, projectId);
        const insert = db.prepare('INSERT INTO tasks (project_id,title,completed,priority,due_date,notes,deleted,sort_order) VALUES (?,?,?,?,?,?,?,?)');
        for (let i = 0; i < p.tasks.length; i++) {
          const t = p.tasks[i];
          const result = insert.run(projectId, t.title, t.completed ? 1 : 0, t.priority, t.dueDate || null, t.notes, t.deleted ? 1 : 0, i);
          addTaskPosition.run(Number(result.lastInsertRowid), projectId, i);
        }
        db.exec('COMMIT');
        return json(res, 201, getProject.get(projectId));
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch (error) { return json(res, 400, { error: error.message === 'Project name is required' ? error.message : 'Invalid project JSON' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return json(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return json(res, 403, { error: 'Archived project' });
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const data = JSON.parse(raw || '{}');
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const project = getProject.get(projectId);
        const result = createTask.run(projectId, title, project.defaultPriority || 'Normal', projectId);
        const taskId = Number(result.lastInsertRowid);
        addTaskPosition.run(taskId, projectId, nextTaskPosition.get(projectId).position);
        return json(res, 201, getTask.get(taskId));
      } catch {
        return json(res, 400, { error: 'Invalid request' });
      }
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/?$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const id = Number(archiveMatch[1]);
      const project = getProject.get(id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (typeof data.defaultPriority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(data.defaultPriority)) return json(res, 400, { error: 'Invalid priority' });
        if (project.archived) return json(res, 403, { error: 'Archived project' });
        setDefaultPriority.run(data.defaultPriority, id, data.defaultPriority);
      } else if (typeof data.name === 'string') {
        const name = data.name.trim();
        if (!name) return json(res, 400, { error: 'Project name is required' });
        if (project.archived) return json(res, 403, { error: 'Archived project' });
        renameProject.run(name, id);
      } else if (typeof data.archived === 'boolean') {
        setArchived.run(data.archived ? 1 : 0, id);
      } else return json(res, 400, { error: 'Invalid project update' });
      return json(res, 200, getProject.get(id));
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const projectId = Number(taskMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 403, { error: 'Archived project' });
      const taskId = Number(taskMatch[2]);
      if (typeof data.deleted === 'boolean') {
        const result = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(data.deleted ? 1 : 0, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
        return json(res, 200, getTask.get(taskId));
      }
      if (Number.isInteger(data.destinationProjectId)) {
        const destination = getProject.get(data.destinationProjectId);
        if (!destination || destination.archived || destination.id === projectId) return json(res, 400, { error: 'Invalid destination project' });
        const position = getTaskPosition.get(taskId, destination.id)?.position ?? nextTaskPosition.get(destination.id).position;
        db.exec('BEGIN');
        try {
          const result = moveTask.run(destination.id, position, taskId, projectId);
          if (!result.changes) { db.exec('ROLLBACK'); return json(res, 404, { error: 'Task not found' }); }
          if (!getTaskPosition.get(taskId, destination.id)) addTaskPosition.run(taskId, destination.id, position);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      } else if (typeof data.dueDate === 'string') {
        const trimmed = data.dueDate.trim();
        let canonical = null;
        if (trimmed) {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
          if (!match) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
          const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
          const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          canonical = trimmed;
        }
        // SQLite may report zero changed rows for a no-op update. Check ownership
        // separately so saving the already-current date remains a successful edit.
        if (!getTask.get(taskId) || getTask.get(taskId).projectId !== projectId) return json(res, 404, { error: 'Task not found' });
        updateDueDate.run(canonical, taskId, projectId);
        const updated = getTask.get(taskId);
        updated.dueDate = getTaskDueDate.get(taskId, projectId)?.dueDate ?? null;
        return json(res, 200, updated);
      } else if (typeof data.notes === 'string') {
        const result = updateNotes.run(data.notes, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else if (typeof data.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(data.priority)) return json(res, 400, { error: 'Invalid priority' });
        const result = updatePriority.run(data.priority, taskId, projectId, data.priority);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else if (typeof data.title === 'string') {
        const title = data.title.trim();
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = renameTask.run(title, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else if (typeof data.completed === 'boolean') {
        const result = updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else return json(res, 400, { error: 'Invalid task update' });
      return json(res, 200, getTask.get(taskId));
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }

  const projectMatch = url.pathname.match(/^\/projects\/(\d+)\/?$/);
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export\/?$/);
  if (req.method === 'GET' && exportMatch) {
    const projectId = Number(exportMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const tasks = listTasks.all(projectId).map(task => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: (task.notes || '').replace(/\r\n?/g, '\n'),
      deleted: Boolean(task.deleted)
    }));
    const document = { format: 'workboard-project', version: 1, project: {
      name: project.name, archived: Boolean(project.archived),
      defaultPriority: project.defaultPriority || 'Normal', tasks
    } };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="workboard-project.json"',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(JSON.stringify(document));
  }
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || projectMatch)) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'app.js')), 'text/javascript; charset=utf-8');
    } catch {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'styles.css')), 'text/css; charset=utf-8');
    } catch {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0');
