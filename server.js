import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    default_task_priority TEXT NOT NULL DEFAULT 'Normal'
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
  )
`);

const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}

const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
    SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid
`);
const getProject = database.prepare('SELECT id, name, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, priority, created_at) VALUES (?, ?, ?, 0, ?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const listMoveDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY created_at, rowid');
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?, created_at =
  COALESCE((SELECT MAX(created_at) + 1 FROM tasks WHERE project_id = ?), 0)
  WHERE id = ? AND project_id = ?`);

function canonicalDueDate(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? trimmed : null;
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

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
    return;
  }

  const destinationsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/destinations$/);
  if (destinationsMatch && request.method === 'GET') {
    const projectId = decodeURIComponent(destinationsMatch[1]);
    if (!getProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, listMoveDestinations.all(projectId));
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const project = { id: randomUUID(), name, archived: 0 };
    insertProject.run(project.id, project.name, Date.now());
    sendJson(response, 201, project);
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const projectId = decodeURIComponent(archiveMatch[1]);
    const project = getProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') {
      sendJson(response, 400, { error: 'Project archive state must be a boolean' });
      return;
    }
    updateProjectArchive.run(body.archived ? 1 : 0, projectId);
    sendJson(response, 200, { ...project, archived: body.archived ? 1 : 0 });
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && ['GET', 'PATCH'].includes(request.method)) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'PATCH') {
      const body = await readJson(request);
      if (typeof body?.defaultTaskPriority === 'string') {
        if (project.archived) {
          sendJson(response, 409, { error: 'Archived projects cannot be changed' });
          return;
        }
        if (!['Low', 'Normal', 'High'].includes(body.defaultTaskPriority)) {
          sendJson(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
          return;
        }
        updateProjectDefaultPriority.run(body.defaultTaskPriority, projectId);
        sendJson(response, 200, { ...project, defaultTaskPriority: body.defaultTaskPriority });
        return;
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        return;
      }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, listTasks.all(projectId));
      return;
    }
    if (request.method === 'POST') {
      const project = getProject.get(projectId);
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot have tasks changed' });
        return;
      }
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      const task = { id: randomUUID(), projectId, title, completed: 0, priority: project.defaultTaskPriority };
      insertTask.run(task.id, projectId, title, task.priority, Date.now());
      sendJson(response, 201, task);
      return;
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = decodeURIComponent(taskMatch[1]);
    const taskId = decodeURIComponent(taskMatch[2]);
    const existing = getTask.get(taskId, projectId);
    if (!existing) {
      sendJson(response, 404, { error: 'Task not found' });
      return;
    }
    const body = await readJson(request);
    if (typeof body?.destinationProjectId === 'string') {
      const source = getProject.get(projectId);
      const destination = getProject.get(body.destinationProjectId);
      if (source.archived || !destination || destination.archived || body.destinationProjectId === projectId) {
        sendJson(response, 400, { error: 'Choose a different active destination project' });
        return;
      }
      moveTask.run(destination.id, destination.id, taskId, projectId);
      sendJson(response, 200, { ...existing, projectId: destination.id });
      return;
    }
    if (typeof body?.completed === 'boolean') {
      const project = getProject.get(projectId);
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      sendJson(response, 200, { ...existing, completed: body.completed ? 1 : 0 });
      return;
    }
    if (typeof body?.title === 'string') {
      const project = getProject.get(projectId);
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const title = body.title.trim();
      if (!title) {
        sendJson(response, 400, { error: 'Task title is required' });
        return;
      }
      renameTask.run(title, taskId, projectId);
      sendJson(response, 200, { ...existing, title });
      return;
    }
    if (typeof body?.priority === 'string') {
      const project = getProject.get(projectId);
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      if (!['Low', 'Normal', 'High'].includes(body.priority)) {
        sendJson(response, 400, { error: 'Task priority must be Low, Normal, or High' });
        return;
      }
      updateTaskPriority.run(body.priority, taskId, projectId);
      sendJson(response, 200, { ...existing, priority: body.priority });
      return;
    }
    if (typeof body?.dueDate === 'string') {
      const project = getProject.get(projectId);
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const dueDate = canonicalDueDate(body.dueDate);
      if (dueDate === null) {
        sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        return;
      }
      updateTaskDueDate.run(dueDate || null, taskId, projectId);
      sendJson(response, 200, { ...existing, dueDate: dueDate || null });
      return;
    }
    sendJson(response, 400, { error: 'Task update must include a title, completion state, priority, or due date' });
    return;
  }

  if (request.method !== 'GET') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const filePath = url.pathname === '/' || url.pathname.startsWith('/projects/')
    ? join(publicDirectory, 'index.html')
    : join(publicDirectory, url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(filePath);
    const type = extname(filePath) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
