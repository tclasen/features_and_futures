import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0
  );
`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
db.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
`);
db.exec('UPDATE tasks SET sort_order = id WHERE sort_order = 0');
db.exec('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position) SELECT id, project_id, sort_order FROM tasks');
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare('SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority, SUM(CASE WHEN t.deleted = 0 THEN 1 ELSE 0 END) AS totalCount, COALESCE(SUM(CASE WHEN t.deleted = 0 THEN t.completed ELSE 0 END), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const updateArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const rememberedPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextProjectPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(root, 'index.html'));

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/directory') {
    const rows = db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted, p.name AS projectName, p.archived AS projectArchived FROM projects p JOIN tasks t ON t.project_id = p.id ORDER BY p.id, t.sort_order, t.id`).all();
    return send(200, JSON.stringify(rows));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, JSON.stringify(listProjects.all()));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    const id = Number(archiveMatch[1]);
    if (!getProject.get(id)) return send(404, JSON.stringify({ error: 'Not found' }));
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived;
      if (typeof archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid request' }));
      updateArchive.run(archived ? 1 : 0, id);
      return send(200, JSON.stringify(getProject.get(id)));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskMatch) {
    const projectId = Number(taskMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (!taskMatch[2] && req.method === 'GET') return send(200, JSON.stringify(listTasks.all(projectId)));
    if (taskMatch[2] && req.method === 'POST') {
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const destinationId = Number(JSON.parse(body).destinationId);
        const source = getProject.get(projectId), destination = getProject.get(destinationId);
        const taskId = Number(taskMatch[2]);
        if (!source || source.archived || !destination || destination.archived || destinationId === projectId || !getTask.get(taskId, projectId)) return send(400, JSON.stringify({ error: 'Invalid destination' }));
        const priorPosition = rememberedPosition.get(taskId, destinationId);
        const position = priorPosition ? priorPosition.position : nextProjectPosition.get(destinationId).position;
        db.exec('BEGIN');
        try {
          if (!priorPosition) rememberPosition.run(taskId, destinationId, position);
          moveTask.run(destinationId, position, taskId, projectId);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return send(200, JSON.stringify({ ok: true }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (!taskMatch[2] && req.method === 'POST') {
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title, getProject.get(projectId).defaultPriority, projectId);
        const taskId = Number(result.lastInsertRowid);
        rememberPosition.run(taskId, projectId, db.prepare('SELECT sort_order AS position FROM tasks WHERE id = ?').get(taskId).position);
        return send(201, JSON.stringify(getTask.get(taskId, projectId)));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (taskMatch[2] && req.method === 'PATCH') {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const bodyValue = JSON.parse(body);
        const id = Number(taskMatch[2]);
        if (!getTask.get(id, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
        if (Object.hasOwn(bodyValue, 'deleted') && typeof bodyValue.deleted === 'boolean') {
          if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
          db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(bodyValue.deleted ? 1 : 0, id, projectId);
        } else {
        if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
        if (typeof bodyValue.completed === 'boolean') {
          updateTask.run(bodyValue.completed ? 1 : 0, id, projectId);
        } else if (['Low', 'Normal', 'High'].includes(bodyValue.priority)) {
          updatePriority.run(bodyValue.priority, id, projectId);
        } else if (Object.hasOwn(bodyValue, 'dueDate')) {
          const dueDate = String(bodyValue.dueDate ?? '').trim();
          if (dueDate && !isValidDate(dueDate)) return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
          updateDueDate.run(dueDate || null, id, projectId);
        } else if (typeof bodyValue.notes === 'string') {
          updateNotes.run(bodyValue.notes, id, projectId);
        } else if (typeof bodyValue.title === 'string') {
          const title = bodyValue.title.trim();
          if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
          renameTask.run(title, id, projectId);
        } else return send(400, JSON.stringify({ error: 'Invalid request' }));
        }
        return send(200, JSON.stringify(getTask.get(id, projectId)));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (exportMatch && req.method === 'GET') {
    const id = Number(exportMatch[1]);
    const project = getProject.get(id);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    const tasks = db.prepare('SELECT title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(id).map(task => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: String(task.notes || '').replace(/\r\n?/g, '\n'),
      deleted: Boolean(task.deleted)
    }));
    const document = { format: 'workboard-project', version: 1, project: { name: project.name, archived: Boolean(project.archived), defaultPriority: project.defaultPriority || 'Normal', tasks } };
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="workboard-project.json"', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(document, null, 2));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (projectMatch && req.method === 'PATCH') {
    const id = Number(projectMatch[1]);
    const project = getProject.get(id);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const value = JSON.parse(body);
      if (['Low', 'Normal', 'High'].includes(value.defaultPriority)) {
        db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(value.defaultPriority, id);
        return send(200, JSON.stringify(getProject.get(id)));
      }
      const name = String(value.name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      renameProject.run(name, id);
      return send(200, JSON.stringify(getProject.get(id)));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/import' && req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const override = String(input.name ?? '').trim();
      if (!override) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const doc = input.document;
      const validPriority = value => ['Low', 'Normal', 'High'].includes(value);
      if (!doc || doc.format !== 'workboard-project' || doc.version !== 1 || !Number.isInteger(doc.version) || !doc.project || typeof doc.project !== 'object' || Array.isArray(doc.project)) throw new Error('invalid');
      const source = doc.project;
      if (typeof source.name !== 'string' || !source.name.trim() || typeof source.archived !== 'boolean' || !validPriority(source.defaultPriority) || !Array.isArray(source.tasks)) throw new Error('invalid');
      for (const task of source.tasks) {
        if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.title !== 'string' || !task.title.trim() || typeof task.completed !== 'boolean' || !validPriority(task.priority) || typeof task.dueDate !== 'string' || (task.dueDate !== '' && !isValidDate(task.dueDate)) || typeof task.notes !== 'string' || typeof task.deleted !== 'boolean') throw new Error('invalid');
      }
      db.exec('BEGIN');
      try {
        const result = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)').run(override, source.archived ? 1 : 0, source.defaultPriority);
        const projectId = Number(result.lastInsertRowid);
        const insert = db.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date, sort_order, notes, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const remember = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
        source.tasks.forEach((task, index) => {
          const id = Number(insert.run(projectId, task.title, task.completed ? 1 : 0, task.priority, task.dueDate || null, index + 1, task.notes.replace(/\r\n?/g, '\n'), task.deleted ? 1 : 0).lastInsertRowid);
          remember.run(id, projectId, index + 1);
        });
        db.exec('COMMIT');
        return send(201, JSON.stringify(getProject.get(projectId)));
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch { return send(400, JSON.stringify({ error: 'Invalid project JSON' })); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, JSON.stringify(getProject.get(result.lastInsertRowid)));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/directory' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
