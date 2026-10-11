import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'data/workboard.sqlite'));
await mkdir(resolve(dbPath, '..'), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
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
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  )
`);
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
// Seed durable membership positions in each task's current visible order. This
// also makes upgrades from earlier Workboard versions preserve existing order.
const projectsWithoutPositions = db.prepare(`SELECT DISTINCT t.project_id AS projectId
  FROM tasks t LEFT JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE p.task_id IS NULL`).all();
const positionTaskIds = db.prepare('SELECT id FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertPosition = db.prepare('INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
for (const { projectId } of projectsWithoutPositions) {
  const existingMax = db.prepare('SELECT COALESCE(MAX(position), -1) AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
  let position = existingMax + 1;
  for (const { id } of positionTaskIds.all(projectId)) insertPosition.run(id, projectId, position++);
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount,
  COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const updateArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = db.prepare(`SELECT t.id, t.title, t.completed, t.priority, t.due_date AS dueDate
  FROM tasks t LEFT JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position, t.created_at, t.rowid`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskTitle = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, listProjects.all());
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const projectId = decodeURIComponent(archiveMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    const archived = archiveMatch[2] === 'archive' ? 1 : 0;
    updateArchive.run(archived, projectId);
    return sendJson(res, 200, { ...project, archived });
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    createProject.run(project.id, project.name, Date.now());
    return sendJson(res, 201, project);
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'PATCH' && projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be renamed' });
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    updateProjectName.run(name, projectId);
    return sendJson(res, 200, { ...project, name });
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
      let payload;
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'Invalid request body' });
      }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), title, completed: 0, priority: getProject.get(projectId).defaultPriority };
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
      db.prepare('INSERT INTO tasks (id, project_id, title, completed, priority, created_at) VALUES (?, ?, ?, 0, ?, ?)')
        .run(task.id, projectId, title, task.priority, Date.now());
      insertPosition.run(task.id, projectId, position);
      return sendJson(res, 201, task);
    }
  }

  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (req.method === 'PATCH' && defaultPriorityMatch) {
    const projectId = decodeURIComponent(defaultPriorityMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
    let payload;
    try { let raw = ''; for await (const chunk of req) raw += chunk; payload = JSON.parse(raw); }
    catch { return sendJson(res, 400, { error: 'Invalid request body' }); }
    if (!['Low', 'Normal', 'High'].includes(payload?.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
    updateDefaultPriority.run(payload.priority, projectId);
    return sendJson(res, 200, { id: projectId, defaultPriority: payload.priority });
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (req.method === 'POST' && moveMatch) {
    const sourceId = decodeURIComponent(moveMatch[1]);
    const taskId = decodeURIComponent(moveMatch[2]);
    const source = getProject.get(sourceId);
    if (!source) return sendJson(res, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
    let payload;
    try { let raw = ''; for await (const chunk of req) raw += chunk; payload = JSON.parse(raw); }
    catch { return sendJson(res, 400, { error: 'Invalid request body' }); }
    const task = getTask.get(taskId, sourceId);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    const destinationId = typeof payload?.destinationProjectId === 'string' ? payload.destinationProjectId : '';
    const destination = getProject.get(destinationId);
    if (!destination || destination.archived || destinationId === sourceId) return sendJson(res, 400, { error: 'Invalid destination project' });
    const priorPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
    const destinationPosition = priorPosition?.position ?? db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value;
    db.exec('BEGIN');
    try {
      insertPosition.run(taskId, destinationId, destinationPosition);
      moveTask.run(destinationId, taskId, sourceId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return sendJson(res, 200, { ...task, projectId: destinationId });
  }
  if (req.method === 'PATCH' && taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(res, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(res, 409, { error: 'Archived projects cannot be changed' });
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    if (typeof payload?.title === 'string') {
      const title = payload.title.trim();
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const result = updateTaskTitle.run(title, taskId, projectId);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskId, title });
    }
    if (typeof payload?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
      const result = updateTaskPriority.run(payload.priority, taskId, projectId);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskId, priority: payload.priority });
    }
    if (typeof payload?.dueDate === 'string') {
      const dueDate = payload.dueDate.trim();
      if (dueDate && !isValidDate(dueDate)) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const result = updateTaskDueDate.run(dueDate || null, taskId, projectId);
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { id: taskId, dueDate: dueDate || null });
    }
    if (typeof payload?.completed !== 'boolean') return sendJson(res, 400, { error: 'Completion state is required' });
    const result = updateTask.run(payload.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
    return sendJson(res, 200, { id: taskId, completed: payload.completed ? 1 : 0 });
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(publicRoot, relative);
    if (file !== publicRoot && !file.startsWith(publicRoot + sep)) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(file);
      res.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream' });
      res.end(content);
      return;
    } catch {
      // Unknown browser routes use the same entry point; missing assets remain 404.
      if (!extname(relative)) {
        const content = await readFile(resolve(publicRoot, 'index.html'));
        res.writeHead(200, { 'content-type': mimeTypes['.html'] });
        res.end(content);
        return;
      }
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    else res.destroy();
  });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
