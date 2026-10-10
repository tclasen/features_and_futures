import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
  )
`);
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

const indexHtml = await readFile(new URL('./index.html', import.meta.url));

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_task_priority AS defaultTaskPriority,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all().map((project) => ({
        ...project, id: Number(project.id), archived: Boolean(project.archived),
        totalCount: Number(project.totalCount), completedCount: Number(project.completedCount),
      }));
    sendJson(response, 200, projects);
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'PATCH') {
    try {
      const body = await readJson(request);
      const projectId = Number(projectMatch[1]);
      const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (typeof body?.archived === 'boolean') {
        database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(Number(body.archived), projectId);
        sendJson(response, 200, { id: projectId, archived: body.archived });
        return;
      }
      if (['Low', 'Normal', 'High'].includes(body?.defaultTaskPriority)) {
        if (project.archived) {
          sendJson(response, 400, { error: 'Archived projects cannot be changed' });
          return;
        }
        database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(body.defaultTaskPriority, projectId);
        sendJson(response, 200, { id: projectId, defaultTaskPriority: body.defaultTaskPriority });
        return;
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot be renamed' });
        return;
      }
      database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      sendJson(response, 200, { id: projectId, name, archived: false });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name, archived: false, defaultTaskPriority: 'Normal', totalCount: 0, completedCount: 0 });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)
      .map((task) => ({ ...task, id: Number(task.id), projectId: Number(task.projectId), completed: Boolean(task.completed) }));
    sendJson(response, 200, tasks);
    return;
  }

  if (tasksMatch && request.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = database.prepare('SELECT id, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot have new tasks' });
        return;
      }
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, project.defaultTaskPriority);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultTaskPriority });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveMatch && request.method === 'POST') {
    try {
      const sourceId = Number(moveMatch[1]);
      const taskId = Number(moveMatch[2]);
      const body = await readJson(request);
      const destinationId = Number(body?.destinationProjectId);
      const source = database.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
      const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
      const task = database.prepare('SELECT title, completed, priority, due_date FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
      if (!source || !destination || !task) {
        sendJson(response, 404, { error: 'Project or task not found' });
        return;
      }
      if (source.archived || destination.archived || sourceId === destinationId) {
        sendJson(response, 400, { error: 'Tasks can only move between different active projects' });
        return;
      }
      database.exec('BEGIN');
      try {
        database.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES (?, ?, ?, ?, ?)')
          .run(destinationId, task.title, task.completed, task.priority, task.due_date);
        database.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(taskId, sourceId);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      sendJson(response, 200, { moved: true, destinationProjectId: destinationId });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (taskMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const body = await readJson(request);
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot be changed' });
        return;
      }
      const task = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
      if (!task) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      if (typeof body?.completed === 'boolean') {
        database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(body.completed), taskId, projectId);
        sendJson(response, 200, { id: taskId, projectId, title: task.title, completed: body.completed, priority: task.priority });
        return;
      }
      if (['Low', 'Normal', 'High'].includes(body?.priority)) {
        database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(body.priority, taskId, projectId);
        sendJson(response, 200, { id: taskId, projectId, title: task.title, completed: Boolean(task.completed), priority: body.priority });
        return;
      }
      if (Object.hasOwn(body ?? {}, 'dueDate')) {
        const value = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
        if (value && !isValidCalendarDate(value)) {
          sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          return;
        }
        const dueDate = value || null;
        database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate, taskId, projectId);
        sendJson(response, 200, { id: taskId, projectId, dueDate });
        return;
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
      sendJson(response, 200, { id: taskId, projectId, title, completed: Boolean(task.completed), priority: task.priority });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

process.on('SIGINT', () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
});
process.on('SIGTERM', () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
});
