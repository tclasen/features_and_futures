import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
)`);
// Upgrade databases created by earlier checkpoints without disturbing project IDs.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
// Add task priority to databases created by earlier checkpoints.
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!taskColumns.some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET sort_order = id');
}
database.exec('PRAGMA foreign_keys = ON');
// Remember each task's position in every project it has belonged to. This is
// separate from tasks.sort_order, which represents only its current project.
database.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, sort_order)
)`);
database.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order)
  SELECT id, project_id, sort_order FROM tasks`);

const page = await readFile(join(root, 'index.html'));
const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, database.prepare(`
      SELECT p.id, p.name, p.archived, p.default_task_priority, COUNT(t.id) AS total_count,
        COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({
      ...project,
      archived: Boolean(project.archived),
      total_count: Number(project.total_count),
      completed_count: Number(project.completed_count)
    })));
  }
  const projectArchive = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectArchive && request.method === 'PATCH') {
    const projectId = Number(projectArchive[1]);
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    if (typeof body?.archived === 'boolean') {
      const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.archived), projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
      return sendJson(response, 200, { id: projectId, archived: body.archived });
    }
    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, projectId);
      if (!result.changes) {
        const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        return sendJson(response, project ? 400 : 404, { error: project ? 'Archived projects cannot be changed' : 'Project not found' });
      }
      return sendJson(response, 200, { id: projectId, name });
    }
    if (['Low', 'Normal', 'High'].includes(body?.default_task_priority)) {
      const result = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0').run(body.default_task_priority, projectId);
      if (!result.changes) {
        const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        return sendJson(response, project ? 400 : 404, { error: project ? 'Archived projects cannot be changed' : 'Project not found' });
      }
      return sendJson(response, 200, { id: projectId, default_task_priority: body.default_task_priority });
    }
    return sendJson(response, 400, { error: 'Project update is required' });
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectTasks = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (projectTasks) {
    const projectId = Number(projectTasks[1]);
    const project = database.prepare('SELECT id, archived, default_task_priority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(projectId);
      return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) })));
    }
    if (request.method === 'POST') {
      if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
      let body;
      try {
        body = await readJson(request);
      } catch {
        return sendJson(response, 400, { error: 'Invalid request body' });
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_task_priority, nextOrder);
      database.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), projectId, nextOrder);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_task_priority });
    }
  }
  const taskCompletion = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskCompletion && request.method === 'PATCH') {
    const projectId = Number(taskCompletion[1]);
    const taskId = Number(taskCompletion[2]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    if (body?.destination_project_id !== undefined) {
      const task = database.prepare('SELECT deleted FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
      if (!task) return sendJson(response, 404, { error: 'Task not found' });
      if (task.deleted) return sendJson(response, 400, { error: 'Deleted tasks cannot be changed' });
      const destinationId = Number(body.destination_project_id);
      const destination = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(destinationId);
      if (!destination || destination.archived || destinationId === projectId) {
        return sendJson(response, 400, { error: 'Destination project must be a different active project' });
      }
      const destinationPosition = database.prepare('SELECT sort_order FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
      const nextOrder = destinationPosition?.sort_order ?? database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value;
      const savePosition = database.prepare('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)');
      const result = database.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationId, nextOrder, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      savePosition.run(taskId, destinationId, nextOrder);
      return sendJson(response, 200, { id: taskId, project_id: destinationId });
    }
    if (typeof body?.deleted === 'boolean') {
      const result = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(Number(body.deleted), taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, deleted: body.deleted });
    }
    const existingTask = database.prepare('SELECT deleted FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
    if (!existingTask) return sendJson(response, 404, { error: 'Task not found' });
    if (existingTask.deleted) return sendJson(response, 400, { error: 'Deleted tasks cannot be changed' });
    if (typeof body?.completed === 'boolean') {
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, completed: body.completed });
    }
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, title });
    }
    if (['Low', 'Normal', 'High'].includes(body?.priority)) {
      const result = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(body.priority, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, priority: body.priority });
    }
    if (body?.due_date === null || typeof body?.due_date === 'string') {
      const rawDate = typeof body.due_date === 'string' ? body.due_date.trim() : '';
      let dueDate = rawDate || null;
      if (dueDate !== null) {
        const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
          return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
      }
      const result = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, due_date: dueDate });
    }
    if (typeof body?.notes === 'string') {
      const result = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?').run(body.notes, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, notes: body.notes });
    }
    return sendJson(response, 400, { error: 'Task update is required' });
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
