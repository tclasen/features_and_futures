import { createServer } from 'node:http';
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
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal'
)`);
// Add the archive flag when opening databases created by earlier checkpoints.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority,
  COUNT(t.id) AS total_count,
  COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER');
  db.exec('UPDATE tasks SET position = id');
}
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
)`);
// Seed membership history for databases created before per-project positions existed.
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks ORDER BY position, id`);
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM task_project_positions WHERE project_id = ?), 0))');
const rememberTaskPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const getRememberedPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextProjectPosition = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM task_project_positions WHERE project_id = ?');
const setTaskPosition = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
const eligibleDestinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = createProject.run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId));
  }
  if (tasksMatch && request.method === 'POST') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
    const result = createTask.run(projectId, title, project.default_priority, projectId);
    const taskId = Number(result.lastInsertRowid);
    const position = db.prepare('SELECT position FROM tasks WHERE id = ?').get(taskId).position;
    rememberTaskPosition.run(taskId, projectId, position);
    return sendJson(response, 201, { id: taskId, title, completed: 0, priority: project.default_priority });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (body?.destination_project_id !== undefined) {
      const destinationId = Number(body.destination_project_id);
      const task = getTask.get(taskId);
      const source = getProject.get(projectId);
      const destination = getProject.get(destinationId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      if (!source || source.archived || !destination || destination.archived || destinationId === projectId) {
        return sendJson(response, 400, { error: 'Invalid destination project' });
      }
      db.exec('BEGIN');
      try {
        let remembered = getRememberedPosition.get(taskId, destinationId);
        if (!remembered) {
          const position = nextProjectPosition.get(destinationId).position;
          rememberTaskPosition.run(taskId, destinationId, position);
          remembered = { position };
        }
        moveTask.run(destinationId, remembered.position, taskId, projectId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return sendJson(response, 200, { id: taskId, project_id: destinationId });
    }
    if (typeof body?.due_date === 'string') {
      const value = body.due_date.trim();
      if (value && !isValidDate(value)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const task = getTask.get(taskId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      updateDueDate.run(value || null, taskId, projectId);
      return sendJson(response, 200, { id: taskId, due_date: value || null });
    }
    if (typeof body?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
      const task = getTask.get(taskId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      updatePriority.run(body.priority, taskId, projectId);
      return sendJson(response, 200, { id: taskId, priority: body.priority });
    }
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const task = getTask.get(taskId);
      if (!task || task.project_id !== projectId) return sendJson(response, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      renameTask.run(title, taskId, projectId);
      return sendJson(response, 200, { id: taskId, title });
    }
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const project = getProject.get(projectId);
    if (!project || project.archived) return sendJson(response, 404, { error: 'Task not found' });
    if (!getTask.get(taskId) || !updateTask.run(body.completed ? 1 : 0, taskId, projectId).changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, completed: body.completed });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(archiveMatch[1]);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    setArchived.run(body.archived ? 1 : 0, projectId);
    return sendJson(response, 200, { id: projectId, archived: body.archived });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (projectMatch && request.method === 'PATCH') {
    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return sendJson(response, 400, { error: 'Invalid request body' }); }
    const projectId = Number(projectMatch[1]);
    if (typeof body?.default_priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.default_priority)) return sendJson(response, 400, { error: 'Invalid default task priority' });
      const project = getProject.get(projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      updateDefaultPriority.run(body.default_priority, projectId);
      return sendJson(response, 200, { id: projectId, default_priority: body.default_priority });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  if (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname)) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(html);
    } catch {
      return sendJson(response, 500, { error: 'Application unavailable' });
    }
  }
  if (url.pathname === '/app.js' || url.pathname === '/styles.css') {
    try {
      const filename = url.pathname.slice(1);
      const content = await readFile(path.join(root, 'public', filename));
      response.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
      return response.end(content);
    } catch {
      return sendJson(response, 404, { error: 'Not found' });
    }
  }
  sendJson(response, 404, { error: 'Not found' });
}

const server = createServer((request, response) => {
  handle(request, response).catch(() => sendJson(response, 500, { error: 'Internal server error' }));
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
