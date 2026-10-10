import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  )
`);
// Existing Task 001/002 databases gain the archive field without losing data.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT,
    position INTEGER NOT NULL DEFAULT 0
  )
`);
// Add priority to task databases created by earlier checkpoints.
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  // Preserve the established creation order for databases from earlier tasks.
  db.exec('UPDATE tasks SET position = id');
}

function parseDueDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  if (!date) return '';
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthLengths[month - 1] ? date : null;
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function sendFile(response, filePath) {
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = db.prepare(`
      SELECT p.id, p.name, p.archived, p.default_task_priority,
        COUNT(t.id) AS total_count,
        COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id
    `).all().map((project) => ({
      ...project,
      id: Number(project.id),
      archived: Boolean(project.archived),
      total_count: Number(project.total_count),
      completed_count: Number(project.completed_count),
    }));
    return sendJson(response, 200, projects);
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRoute && request.method === 'PATCH') {
    const body = await readJson(request);
    if (Object.hasOwn(body || {}, 'name')) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectRoute[1]));
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(projectRoute[1]));
      return sendJson(response, 200, { id: Number(projectRoute[1]), name });
    }
    if (Object.hasOwn(body || {}, 'default_task_priority')) {
      if (!['Low', 'Normal', 'High'].includes(body.default_task_priority)) {
        return sendJson(response, 400, { error: 'Invalid default task priority' });
      }
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectRoute[1]));
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(body.default_task_priority, Number(projectRoute[1]));
      return sendJson(response, 200, { id: Number(projectRoute[1]), default_task_priority: body.default_task_priority });
    }
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state is required' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, Number(projectRoute[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, { id: Number(projectRoute[1]), archived: body.archived });
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+)(\/move)?)?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
    const project = db.prepare('SELECT id, archived, default_task_priority FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (!taskId && request.method === 'GET') {
      const tasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id').all(projectId)
        .map((task) => ({ ...task, id: Number(task.id), completed: Boolean(task.completed) }));
      return sendJson(response, 200, tasks);
    }
    if (!taskId && request.method === 'POST') {
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = db.prepare(`
        INSERT INTO tasks (project_id, title, priority, position)
        VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE project_id = ?), 0))
      `).run(projectId, title, project.default_task_priority, projectId);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_task_priority });
    }
    if (taskId && taskRoute[3] === '/move' && request.method === 'POST') {
      const body = await readJson(request);
      const destinationId = Number(body?.destination_project_id);
      // Validate ownership and both project states in the same write transaction
      // as the move so a task can never be appended using a stale destination.
      db.exec('BEGIN IMMEDIATE');
      try {
        const source = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
        if (!source || source.archived) {
          db.exec('ROLLBACK');
          return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
        }
        const destination = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(destinationId);
        if (!destination || destination.archived || destinationId === projectId) {
          db.exec('ROLLBACK');
          return sendJson(response, 400, { error: 'Invalid destination project' });
        }
        const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
        if (!task) {
          db.exec('ROLLBACK');
          return sendJson(response, 404, { error: 'Task not found' });
        }
        // Read the destination's next position before changing ownership. This
        // makes the append order explicit and avoids depending on whether a
        // correlated subquery observes the row midway through the UPDATE.
        const nextPosition = db.prepare(
          'SELECT COALESCE(MAX(position) + 1, 0) AS position FROM tasks WHERE project_id = ?',
        ).get(destinationId).position;
        const result = db.prepare(
          'UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?',
        ).run(destinationId, nextPosition, taskId, projectId);
        if (!result.changes) {
          db.exec('ROLLBACK');
          return sendJson(response, 404, { error: 'Task not found' });
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return sendJson(response, 200, { id: taskId, project_id: destinationId });
    }
    if (taskId && request.method === 'PATCH') {
      if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
      const body = await readJson(request);
      if (Object.hasOwn(body || {}, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) {
          return sendJson(response, 400, { error: 'Invalid task priority' });
        }
        const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?')
          .run(body.priority, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, priority: body.priority });
      }
      if (Object.hasOwn(body || {}, 'due_date')) {
        const dueDate = parseDueDate(body.due_date);
        if (dueDate === null) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?')
          .run(dueDate || null, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, due_date: dueDate || null });
      }
      if (Object.hasOwn(body || {}, 'title')) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?')
          .run(title, taskId, projectId);
        if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
        return sendJson(response, 200, { id: taskId, title });
      }
      if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
        .run(body.completed ? 1 : 0, taskId, projectId);
      if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, { id: taskId, completed: body.completed });
    }
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/')) {
    return sendJson(response, 404, { error: 'Not found' });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    return sendFile(response, join(publicDir, 'index.html'));
  }
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const asset = url.pathname.slice('/assets/'.length);
    if (!['app.js', 'style.css'].includes(asset)) return response.writeHead(404).end('Not found');
    return sendFile(response, join(publicDir, asset));
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return sendFile(response, join(publicDir, 'index.html'));
  }
  response.writeHead(404).end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
