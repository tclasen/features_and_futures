import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep this migration safe for databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'");
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Existing databases from earlier checkpoints gain the default priority safely.
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET position = id');
}
// Keep an ordering slot for every project a task has belonged to. The current
// tasks.position remains the fast path for listing the task's present project.
database.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
)`);
// Seed the current positions for tasks created before this migration.
database.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_task_priority,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    for (const project of projects) {
      project.archived = Boolean(project.archived);
      project.total_count = Number(project.total_count);
      project.completed_count = Number(project.completed_count);
    }
    return sendJson(response, 200, projects);
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare(`SELECT p.id, p.name, p.archived, p.default_task_priority,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.id = ? GROUP BY p.id`).get(Number(projectMatch[1]));
    if (project) {
      project.archived = Boolean(project.archived);
      project.total_count = Number(project.total_count);
      project.completed_count = Number(project.completed_count);
    }
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?')
      .run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const projectId = Number(renameMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-task-priority$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const priorities = ['Low', 'Normal', 'High'];
    if (!priorities.includes(payload.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const projectId = Number(defaultPriorityMatch[1]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
    database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(payload.priority, projectId);
    return sendJson(response, 200, { id: projectId, default_task_priority: payload.priority });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const tasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id').all(projectId);
    return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id, default_task_priority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId).archived) {
      return sendJson(response, 409, { error: 'Archived projects cannot receive tasks' });
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const position = database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?').get(projectId).position;
    const result = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)').run(projectId, title, project.default_task_priority, position);
    database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), projectId, position);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_task_priority });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const moveTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveTaskMatch && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const taskId = Number(moveTaskMatch[1]);
    const destinationId = Number(payload.destination_project_id);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    const source = database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id);
    const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
    if (source.archived || !destination || destination.archived) {
      return sendJson(response, 409, { error: 'Tasks can only move between active projects' });
    }
    if (task.project_id === destinationId) return sendJson(response, 400, { error: 'Destination must be another project' });
    const rememberedPosition = database.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
    const nextPosition = rememberedPosition?.position ?? database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?').get(destinationId).position;
    if (!rememberedPosition) {
      database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, destinationId, nextPosition);
    }
    database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ?').run(destinationId, nextPosition, taskId);
    return sendJson(response, 200, { id: taskId, destination_project_id: destinationId });
  }
  const dueDateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
  if (dueDateMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const rawDate = typeof payload.due_date === 'string' ? payload.due_date.trim() : '';
    let dueDate = rawDate || null;
    if (dueDate && !isValidDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    const taskId = Number(dueDateMatch[1]);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) {
      return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    }
    database.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate, taskId);
    return sendJson(response, 200, { id: taskId, due_date: dueDate });
  }
  const priorityMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/priority$/);
  if (priorityMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const priorities = ['Low', 'Normal', 'High'];
    if (!priorities.includes(payload.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const taskId = Number(priorityMatch[1]);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) {
      return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    }
    database.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(payload.priority, taskId);
    return sendJson(response, 200, { id: taskId, priority: payload.priority });
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (renameTaskMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const taskId = Number(renameTaskMatch[1]);
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) {
      return sendJson(response, 409, { error: 'Archived project tasks cannot be renamed' });
    }
    database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, taskId);
    return sendJson(response, 200, { id: taskId, title });
  }
  if (taskMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof payload.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(taskMatch[1]));
    if (task && database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) {
      return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    }
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(payload.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: Number(taskMatch[1]), completed: payload.completed });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(await readFile(join(root, 'index.html')));
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}
