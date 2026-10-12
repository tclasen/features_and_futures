import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date TEXT,
  sort_order INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER');
}
if (!taskColumns.some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!taskColumns.some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
db.exec(`UPDATE tasks SET sort_order = id WHERE sort_order IS NULL;
CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order)
  SELECT id, project_id, sort_order FROM tasks;`);
const indexHtml = await readFile(join(import.meta.dirname, 'public', 'index.html'));
const clientJs = await readFile(join(import.meta.dirname, 'public', 'app.js'));

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

async function readBody(request) {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    return { value: JSON.parse(raw) };
  } catch {
    return { error: 'Invalid JSON' };
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const moveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveRoute && request.method === 'POST') {
    const sourceId = Number(moveRoute[1]);
    const taskId = Number(moveRoute[2]);
    const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
    if (!source) return sendJson(response, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
    const body = await readBody(request);
    if (body.error) return sendJson(response, 400, { error: body.error });
    const destinationId = Number(body.value?.destinationProjectId);
    const destination = db.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    if (!destination || destination.archived || destinationId === sourceId) return sendJson(response, 400, { error: 'Invalid destination project' });
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    const existingPosition = db.prepare('SELECT sort_order FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
    const destinationOrder = existingPosition?.sort_order ?? db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM task_project_positions WHERE project_id = ?').get(destinationId).next;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(taskId, destinationId, destinationOrder);
      db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationId, destinationOrder, taskId, sourceId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return sendJson(response, 200, { id: taskId, projectId: destinationId });
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
    if (request.method === 'GET' && !taskId) {
      return sendJson(response, 200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) })));
    }
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'POST' && !taskId) {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const body = await readBody(request);
      if (body.error) return sendJson(response, 400, { error: body.error });
      const title = typeof body.value?.title === 'string' ? body.value.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
      const defaultPriority = db.prepare('SELECT default_priority FROM projects WHERE id = ?').get(projectId).default_priority;
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId).next;
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, defaultPriority, order);
      db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), projectId, order);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: defaultPriority });
    }
    if (request.method === 'PATCH' && taskId) {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const body = await readBody(request);
      if (body.error) return sendJson(response, 400, { error: body.error });
      if (typeof body.value?.deleted === 'boolean') {
        const result = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(Number(body.value.deleted), taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, deleted: body.value.deleted });
      }
      if (typeof body.value?.notes === 'string') {
        const result = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?').run(body.value.notes, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, notes: body.value.notes });
      }
      if (Object.hasOwn(body.value || {}, 'dueDate')) {
        const rawDate = body.value.dueDate;
        const dueDate = typeof rawDate === 'string' ? rawDate.trim() : null;
        if (dueDate !== null && dueDate !== '' && !isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate || null, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, dueDate: dueDate || null });
      }
      if (typeof body.value?.priority === 'string') {
        const priority = body.value.priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(priority, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, priority });
      }
      if (typeof body.value?.title === 'string') {
        const title = body.value.title.trim();
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, title });
      }
      if (typeof body.value?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be boolean' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.value.completed), taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, completed: body.value.completed });
    }
    return sendJson(response, 404, { error: 'Not found' });
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'POST' && url.pathname === '/api/directory/bulk') {
    const parsed = await readBody(request);
    if (parsed.error) return sendJson(response, 400, { error: parsed.error });
    const { taskIds, completed } = parsed.value || {};
    if (!Array.isArray(taskIds) || !taskIds.every(id => Number.isInteger(id) && id > 0) || typeof completed !== 'boolean') {
      return sendJson(response, 400, { error: 'Invalid bulk update' });
    }
    const update = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND deleted = 0
      AND project_id IN (SELECT id FROM projects WHERE archived = 0)`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of new Set(taskIds)) update.run(Number(completed), id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return sendJson(response, 200, { updated: new Set(taskIds).size });
  }
  if (request.method === 'GET' && url.pathname === '/api/directory') {
    const rows = db.prepare(`SELECT p.id AS projectId, p.name AS projectName, p.archived,
      t.id AS taskId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
      FROM projects p JOIN tasks t ON t.project_id = p.id
      ORDER BY p.id, t.sort_order, t.id`).all();
    return sendJson(response, 200, rows.map(row => ({ ...row, archived: Boolean(row.archived), completed: Boolean(row.completed), deleted: Boolean(row.deleted), dueDate: row.dueDate || '', notes: row.notes || '' })));
  }
  const exportRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (exportRoute && request.method === 'GET') {
    const projectId = Number(exportRoute[1]);
    const project = db.prepare('SELECT name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const tasks = db.prepare(`SELECT title, completed, priority, due_date AS dueDate, notes, deleted
      FROM tasks WHERE project_id = ? ORDER BY sort_order, id`).all(projectId).map(task => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: (task.notes || '').replace(/\r\n?/g, '\n'),
      deleted: Boolean(task.deleted)
    }));
    const document = { format: 'workboard-project', version: 1, project: { name: project.name, archived: Boolean(project.archived), defaultPriority: project.defaultPriority || 'Normal', tasks } };
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="workboard-project.json"'
    });
    return response.end(JSON.stringify(document));
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRoute && request.method === 'PATCH') {
    const body = await readBody(request);
    if (body.error) return sendJson(response, 400, { error: body.error });
    const id = Number(projectRoute[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(id);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (typeof body.value?.defaultPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.value.defaultPriority)) return sendJson(response, 400, { error: 'Invalid default task priority' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(body.value.defaultPriority, id);
      return sendJson(response, 200, { id, defaultPriority: body.value.defaultPriority });
    }
    if (typeof body.value?.name === 'string') {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project is read-only' });
      const name = body.value.name.trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
      return sendJson(response, 200, { id, name });
    }
    if (typeof body.value?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archived must be boolean' });
    db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.value.archived), id);
    return sendJson(response, 200, { id, archived: body.value.archived });
  }
  if (url.pathname === '/api/import' && request.method === 'POST') {
    const parsed = await readBody(request);
    if (parsed.error) return sendJson(response, 400, { error: 'Invalid project JSON' });
    const body = parsed.value;
    const override = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!override) return sendJson(response, 400, { error: 'Project name is required' });
    const document = body?.document;
    const priorities = ['Low', 'Normal', 'High'];
    const validTask = task => task && typeof task === 'object' &&
      typeof task.title === 'string' && task.title.trim() && typeof task.completed === 'boolean' &&
      priorities.includes(task.priority) && typeof task.dueDate === 'string' &&
      (task.dueDate === '' || isValidDueDate(task.dueDate)) && typeof task.notes === 'string' && typeof task.deleted === 'boolean';
    const source = document?.project;
    if (!document || document.format !== 'workboard-project' || document.version !== 1 || !Number.isInteger(document.version) ||
        !source || typeof source !== 'object' || typeof source.name !== 'string' || !source.name.trim() ||
        typeof source.archived !== 'boolean' || !priorities.includes(source.defaultPriority) ||
        !Array.isArray(source.tasks) || !source.tasks.every(validTask)) {
      return sendJson(response, 400, { error: 'Invalid project JSON' });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const projectResult = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)').run(override, Number(source.archived), source.defaultPriority);
      const projectId = Number(projectResult.lastInsertRowid);
      const insertTask = db.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const insertPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)');
      source.tasks.forEach((task, index) => {
        const order = index + 1;
        const result = insertTask.run(projectId, task.title, Number(task.completed), task.priority, task.dueDate || null, task.notes.replace(/\\r\\n?/g, '\\n'), Number(task.deleted), order);
        insertPosition.run(Number(result.lastInsertRowid), projectId, order);
      });
      db.exec('COMMIT');
      return sendJson(response, 201, { id: projectId });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
      COUNT(CASE WHEN t.deleted = 0 THEN t.id END) AS totalCount,
      COALESCE(SUM(CASE WHEN t.deleted = 0 THEN t.completed ELSE 0 END), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    return sendJson(response, 200, projects.map(project => ({ ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount) })));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const parsed = await readBody(request);
    if (parsed.error) return sendJson(response, 400, { error: parsed.error });
    const name = typeof parsed.value?.name === 'string' ? parsed.value.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/directory' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(clientJs);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
