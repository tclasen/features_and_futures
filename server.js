import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    default_priority TEXT NOT NULL DEFAULT 'Normal'
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT
  )
  ;
  CREATE TABLE IF NOT EXISTS task_project_positions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (project_id, task_id),
    UNIQUE (project_id, position)
  )
`);
// Upgrade databases created by earlier checkpoints without disturbing their data.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
// Preserve each task's order in every project it has visited. Existing tasks
// receive positions matching their current project order during this upgrade.
database.exec(`
  INSERT OR IGNORE INTO task_project_positions (project_id, task_id, position)
  SELECT project_id, id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, rowid) - 1
  FROM tasks
`);
const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority, COUNT(t.id) AS totalCount,
    COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = database.prepare(`
  SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate
  FROM tasks t JOIN task_project_positions position ON position.task_id = t.id AND position.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY position.position
`);
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const insertTaskPosition = database.prepare('INSERT INTO task_project_positions (project_id, task_id, position) VALUES (?, ?, ?)');
const nextTaskPosition = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_project_positions WHERE project_id = ?');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const moveTask = database.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');
const ensureTaskPosition = database.prepare('INSERT OR IGNORE INTO task_project_positions (project_id, task_id, position) VALUES (?, ?, ?)');
const taskPosition = database.prepare('SELECT position FROM task_project_positions WHERE project_id = ? AND task_id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const mimeType = (path) => contentTypes[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream';
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

function canonicalDueDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1] ? trimmed : null;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    return sendJson(res, 200, listProjects.all(archived).map((project) => ({
      ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount),
    })));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return sendJson(res, 201, project);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(projectMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const counts = database.prepare(`SELECT COUNT(*) AS totalCount, COALESCE(SUM(completed), 0) AS completedCount FROM tasks WHERE project_id = ?`).get(project.id);
    return sendJson(res, 200, { ...project, archived: Boolean(project.archived), totalCount: Number(counts.totalCount), completedCount: Number(counts.completedCount) });
  }
  if (req.method === 'PATCH' && projectMatch) {
    const project = findProject.get(projectMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    if (typeof body?.defaultPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.defaultPriority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      updateProjectDefaultPriority.run(body.defaultPriority, project.id);
      return sendJson(res, 200, { ...project, defaultPriority: body.defaultPriority });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    renameProject.run(name, project.id);
    return sendJson(res, 200, { ...project, name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    const project = findProject.get(archiveMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const body = await readJson(req);
    if (typeof body?.archived !== 'boolean') return sendJson(res, 400, { error: 'Archive state is required' });
    updateProjectArchive.run(body.archived ? 1 : 0, project.id);
    return sendJson(res, 200, { ...project, archived: body.archived });
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!findProject.get(tasksMatch[1])) return sendJson(res, 404, { error: 'Project not found' });
    return sendJson(res, 200, listTasks.all(tasksMatch[1]).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    const project = findProject.get(tasksMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'Task title is required' });
    const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: false, priority: project.defaultPriority };
    insertTask.run(task.id, task.projectId, task.title, Date.now(), task.priority);
    insertTaskPosition.run(task.projectId, task.id, nextTaskPosition.get(task.projectId).next);
    return sendJson(res, 201, task);
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (moveMatch && req.method === 'POST') {
    const source = findProject.get(moveMatch[1]);
    if (!source) return sendJson(res, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    const destination = typeof body?.destinationProjectId === 'string' ? findProject.get(body.destinationProjectId) : null;
    if (!destination || destination.archived || destination.id === source.id) return sendJson(res, 400, { error: 'Invalid destination project' });
    database.exec('BEGIN');
    let result;
    try {
      // First arrivals establish a position after current members. Returning
      // tasks already have a saved slot, so their original relative order wins.
      ensureTaskPosition.run(destination.id, moveMatch[2], nextTaskPosition.get(destination.id).next);
      result = moveTask.run(destination.id, moveMatch[2], source.id);
      if (!result.changes) {
        database.exec('ROLLBACK');
        return sendJson(res, 404, { error: 'Task not found' });
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return sendJson(res, 200, { id: moveMatch[2], projectId: destination.id });
  }
  if (taskMatch && req.method === 'PATCH') {
    const project = findProject.get(taskMatch[1]);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived project' });
    const body = await readJson(req);
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = renameTask.run(title, taskMatch[2], taskMatch[1]);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskMatch[2], projectId: taskMatch[1], title });
    }
    if (typeof body?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      const result = updateTaskPriority.run(body.priority, taskMatch[2], taskMatch[1]);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskMatch[2], projectId: taskMatch[1], priority: body.priority });
    }
    if (typeof body?.dueDate === 'string') {
      const dueDate = canonicalDueDate(body.dueDate);
      if (dueDate === null) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const result = updateTaskDueDate.run(dueDate || null, taskMatch[2], taskMatch[1]);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskMatch[2], projectId: taskMatch[1], dueDate: dueDate || null });
    }
    if (typeof body?.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    const result = updateTaskCompletion.run(body.completed ? 1 : 0, taskMatch[2], taskMatch[1]);
    if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
    return sendJson(res, 200, { id: taskMatch[2], projectId: taskMatch[1], completed: body.completed });
  }

  const requestedPath = url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.replace(/^\//, '');
  const filePath = join(root, 'public', requestedPath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'content-type': mimeType(filePath) });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
