import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at INTEGER NOT NULL
  )
`);

// Keep a task's position for every project it has belonged to. This lets a
// task return to its earlier place while its current fields remain on tasks.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
`);
const missingPositions = db.prepare(`
  SELECT t.id, t.project_id, t.created_at, t.rowid AS task_rowid
  FROM tasks t
  LEFT JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE p.task_id IS NULL
  ORDER BY t.project_id, t.created_at, t.rowid
`).all();
const insertTaskPosition = db.prepare('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const nextProjectPosition = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM task_project_positions WHERE project_id = ?');
for (const task of missingPositions) {
  insertTaskPosition.run(task.id, task.project_id, nextProjectPosition.get(task.project_id).position);
}

const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name);
if (!taskColumns.includes('priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
if (!taskColumns.includes('due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
if (!projectColumns.includes('default_task_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");

const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COALESCE(counts.completed_count, 0) AS completed_count,
  COALESCE(counts.total_count, 0) AS total_count
  FROM projects p
  LEFT JOIN (
    SELECT project_id, COUNT(*) AS total_count,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_count
    FROM tasks GROUP BY project_id
  ) counts ON counts.project_id = p.id
  WHERE p.archived = ? ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const updateProjectArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listTasks = db.prepare(`SELECT t.id, t.title, t.completed, t.priority, t.due_date
  FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position`);
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE id = ?');
const updateTaskCompletion = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?');
const getTaskPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const insertPositionAtEnd = db.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM task_project_positions WHERE project_id = ?))`);

function isValidDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function serveAsset(response, file, type) {
  try {
    response.writeHead(200, { 'content-type': type });
    response.end(readFileSync(join(root, 'public', file)));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive\/?$/);
  if (archiveMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
    const project = getProject.get(decodeURIComponent(archiveMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    updateProjectArchive.run(body.archived ? 1 : 0, project.id);
    return sendJson(response, 200, { ...project, archived: body.archived ? 1 : 0 });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/name\/?$/);
  if (renameMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = getProject.get(decodeURIComponent(renameMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
    updateProjectName.run(name, project.id);
    return sendJson(response, 200, { ...project, name });
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-task-priority\/?$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const priority = body?.priority;
    if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid default task priority' });
    const project = getProject.get(decodeURIComponent(defaultPriorityMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project' });
    updateProjectDefaultPriority.run(priority, project.id);
    return sendJson(response, 200, { ...project, default_task_priority: priority });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return sendJson(response, 201, project);
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      if (getProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived project' });
      let body;
      try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), title, completed: 0, priority: getProject.get(projectId).default_task_priority };
      insertTask.run(task.id, projectId, title, Date.now(), task.priority);
      insertPositionAtEnd.run(task.id, projectId, projectId);
      return sendJson(response, 201, task);
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/?$/);
  if (request.method === 'PATCH' && taskMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
    const task = getTask.get(decodeURIComponent(taskMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskCompletion.run(body.completed ? 1 : 0, task.id);
    return sendJson(response, 200, { ...task, completed: body.completed ? 1 : 0 });
  }
  const taskTitleMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/title\/?$/);
  if (request.method === 'PATCH' && taskTitleMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const task = getTask.get(decodeURIComponent(taskTitleMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskTitle.run(title, task.id);
    return sendJson(response, 200, { ...task, title });
  }
  const taskPriorityMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/priority\/?$/);
  if (request.method === 'PATCH' && taskPriorityMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const priority = body?.priority;
    if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const task = getTask.get(decodeURIComponent(taskPriorityMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskPriority.run(priority, task.id);
    return sendJson(response, 200, { ...task, priority });
  }
  const taskDueDateMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/due-date\/?$/);
  if (request.method === 'PATCH' && taskDueDateMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof body?.dueDate !== 'string') return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    const dueDate = body.dueDate.trim();
    if (dueDate && !isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    const task = getTask.get(decodeURIComponent(taskDueDateMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    if (getProject.get(task.project_id).archived) return sendJson(response, 409, { error: 'Archived project' });
    updateTaskDueDate.run(dueDate || null, task.id);
    return sendJson(response, 200, { ...task, due_date: dueDate || null });
  }
  const moveTaskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/move\/?$/);
  if (request.method === 'PATCH' && moveTaskMatch) {
    let body;
    try { body = await readJson(request); } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    const task = getTask.get(decodeURIComponent(moveTaskMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    const source = getProject.get(task.project_id);
    if (source.archived) return sendJson(response, 409, { error: 'Archived project' });
    const destinationId = typeof body?.destinationProjectId === 'string' ? body.destinationProjectId : '';
    const destination = getProject.get(destinationId);
    if (!destination || destination.archived || destination.id === source.id) {
      return sendJson(response, 400, { error: 'Invalid destination project' });
    }
    if (!getTaskPosition.get(task.id, destination.id)) {
      insertPositionAtEnd.run(task.id, destination.id, destination.id);
    }
    moveTask.run(destination.id, task.id);
    return sendJson(response, 200, { ...task, project_id: destination.id });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const project = getProject.get(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/') return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/app.js') return serveAsset(response, 'app.js', 'text/javascript; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/styles.css') return serveAsset(response, 'styles.css', 'text/css; charset=utf-8');
  response.writeHead(404);
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
