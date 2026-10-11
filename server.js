import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);
// Upgrade databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  database.exec(`UPDATE tasks AS task SET sort_order = (
    SELECT COUNT(*) - 1 FROM tasks AS earlier
    WHERE earlier.project_id = task.project_id AND earlier.id <= task.id
  )`);
}

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const assets = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./app.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./styles.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./index.html', import.meta.url));

function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS totalCount,
        COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
    `).all(archived).map((project) => ({ ...project, archived: Boolean(project.archived) }));
    return sendJson(response, 200, projects);
  }
  const projectPath = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectPath && request.method === 'PATCH') {
    let changes;
    try { changes = await readBody(request); } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const projectId = Number(projectPath[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (typeof changes.archived === 'boolean') {
      database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(changes.archived ? 1 : 0, projectId);
      return sendJson(response, 200, { id: projectId, archived: changes.archived });
    }
    if (typeof changes.name === 'string') {
      const name = changes.name.trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
      database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return sendJson(response, 200, { id: projectId, name });
    }
    if (typeof changes.defaultTaskPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(changes.defaultTaskPriority)) return sendJson(response, 400, { error: 'Invalid default task priority' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot change the default task priority' });
      database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(changes.defaultTaskPriority, projectId);
      return sendJson(response, 200, { id: projectId, defaultTaskPriority: changes.defaultTaskPriority });
    }
    return sendJson(response, 400, { error: 'A project name, default priority, or archive state is required' });
  }
  if (projectPath && request.method === 'GET') {
    const project = database.prepare('SELECT id, name, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?').get(Number(projectPath[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let name;
    try {
      name = (await readBody(request)).name;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksPath = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksPath && request.method === 'GET') {
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(Number(tasksPath[1]));
    return sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksPath && request.method === 'POST') {
    let title;
    try {
      title = (await readBody(request)).title;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    title = typeof title === 'string' ? title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const projectId = Number(tasksPath[1]);
    const project = database.prepare('SELECT id, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM tasks WHERE project_id = ?').get(projectId).value;
    const result = database.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.defaultTaskPriority, nextOrder);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultTaskPriority, dueDate: null });
  }
  const taskPath = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskPath && request.method === 'PATCH') {
    let changes;
    try {
      changes = await readBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const taskId = Number(taskPath[1]);
    const task = database.prepare(`
      SELECT tasks.id, tasks.project_id AS projectId, tasks.completed, projects.archived
      FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?
    `).get(taskId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (changes.destinationProjectId !== undefined) {
      const destinationId = Number(changes.destinationProjectId);
      if (!Number.isInteger(destinationId)) return sendJson(response, 400, { error: 'Invalid destination project' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived projects cannot move tasks' });
      const destination = database.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(destinationId);
      if (!destination || destinationId === task.projectId) return sendJson(response, 400, { error: 'Invalid destination project' });
      const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM tasks WHERE project_id = ?').get(destinationId).value;
      database.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ?').run(destinationId, nextOrder, taskId);
      return sendJson(response, 200, { id: taskId, projectId: destinationId });
    }
    if (typeof changes.title === 'string') {
      const title = changes.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived projects cannot rename tasks' });
      database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, taskId);
      return sendJson(response, 200, { id: taskId, title, completed: Boolean(task.completed) });
    }
    if (typeof changes.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(changes.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived projects cannot change task priorities' });
      database.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(changes.priority, taskId);
      return sendJson(response, 200, { id: taskId, priority: changes.priority });
    }
    if (typeof changes.dueDate === 'string') {
      const dueDate = changes.dueDate.trim();
      if (dueDate && !isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      if (task.archived) return sendJson(response, 409, { error: 'Archived projects cannot change due dates' });
      database.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate || null, taskId);
      return sendJson(response, 200, { id: taskId, dueDate: dueDate || null });
    }
    if (typeof changes.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be a boolean' });
    database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(changes.completed ? 1 : 0, taskId);
    return sendJson(response, 200, { id: taskId, completed: changes.completed });
  }
  if (request.method === 'GET' && assets.has(url.pathname)) {
    const [contentType, content] = assets.get(url.pathname);
    response.writeHead(200, { 'content-type': contentType });
    return response.end(content);
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});
