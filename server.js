import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);
database.exec('PRAGMA foreign_keys = ON');
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET sort_order = id');
}
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const readBody = (request) => new Promise((resolveBody, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try { resolveBody(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
  });
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_task_priority AS defaultTaskPriority,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all();
    sendJson(response, 200, projects.map((project) => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }

  if (request.method === 'PATCH' && projectMatch) {
    try {
      const body = await readBody(request);
      if (typeof body.defaultTaskPriority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.defaultTaskPriority)) {
          sendJson(response, 400, { error: 'Invalid task priority' });
          return;
        }
        const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
        if (!project) {
          sendJson(response, 404, { error: 'Project not found' });
          return;
        }
        if (project.archived) {
          sendJson(response, 400, { error: 'Archived projects cannot be changed' });
          return;
        }
        database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(body.defaultTaskPriority, Number(projectMatch[1]));
        sendJson(response, 200, { defaultTaskPriority: body.defaultTaskPriority });
        return;
      }
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(projectMatch[1]));
      if (!result.changes) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      sendJson(response, 200, { id: Number(projectMatch[1]), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    if (!result.changes) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { archived: archiveMatch[2] === 'archive' });
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id').all(projectId);
      sendJson(response, 200, tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })));
      return;
    }
    if (request.method === 'POST') {
      if (project.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot be changed' });
        return;
      }
      try {
        const body = await readBody(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const defaultTaskPriority = database.prepare('SELECT default_task_priority FROM projects WHERE id = ?').get(projectId).default_task_priority;
        const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(projectId).value;
        const result = database.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, defaultTaskPriority, nextOrder);
        sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: defaultTaskPriority });
      } catch {
        sendJson(response, 400, { error: 'Invalid request' });
      }
      return;
    }
  }

  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (request.method === 'POST' && moveMatch) {
    try {
      const body = await readBody(request);
      const destinationId = Number(body.destinationProjectId);
      const taskId = Number(moveMatch[1]);
      const task = database.prepare(`SELECT tasks.project_id AS projectId, projects.archived
        FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?`).get(taskId);
      const destination = database.prepare('SELECT archived FROM projects WHERE id = ?').get(destinationId);
      if (!task || !destination) {
        sendJson(response, 404, { error: 'Task or destination project not found' });
        return;
      }
      if (task.archived || destination.archived || task.projectId === destinationId) {
        sendJson(response, 400, { error: 'Task can only move between different active projects' });
        return;
      }
      const nextOrder = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(destinationId).value;
      database.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ?').run(destinationId, nextOrder, taskId);
      sendJson(response, 200, { projectId: destinationId });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const body = await readBody(request);
      const task = database.prepare(`SELECT tasks.project_id AS projectId, projects.archived
        FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?`).get(Number(taskMatch[1]));
      if (!task) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      if (task.archived) {
        sendJson(response, 400, { error: 'Archived projects cannot be changed' });
        return;
      }
      if (typeof body.title === 'string') {
        const title = body.title.trim();
        if (!title) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        database.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, Number(taskMatch[1]));
        sendJson(response, 200, { title });
        return;
      }
      if (typeof body.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) {
          sendJson(response, 400, { error: 'Invalid task priority' });
          return;
        }
        database.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(body.priority, Number(taskMatch[1]));
        sendJson(response, 200, { priority: body.priority });
        return;
      }
      if (Object.hasOwn(body, 'dueDate')) {
        if (typeof body.dueDate !== 'string') {
          sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          return;
        }
        const dueDate = body.dueDate.trim();
        if (dueDate !== '') {
          const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!match) {
            sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
            return;
          }
          const year = Number(match[1]);
          const month = Number(match[2]);
          const day = Number(match[3]);
          const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
          const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
            sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
            return;
          }
        }
        database.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate || null, Number(taskMatch[1]));
        sendJson(response, 200, { dueDate: dueDate || null });
        return;
      }
      if (typeof body.completed !== 'boolean') {
        sendJson(response, 400, { error: 'Completion must be a boolean' });
        return;
      }
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, Number(taskMatch[1]));
      if (!result.changes) {
        sendJson(response, 404, { error: 'Task not found' });
        return;
      }
      sendJson(response, 200, { completed: body.completed });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET') {
    const file = url.pathname === '/' || url.pathname.startsWith('/projects/')
      ? 'index.html'
      : url.pathname.slice(1);
    if (file === 'index.html' || file === 'app.js' || file === 'styles.css') {
      const { readFile } = await import('node:fs/promises');
      try {
        const content = await readFile(join(root, 'public', file));
        const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8' };
        response.writeHead(200, { 'content-type': types[file] });
        response.end(content);
      } catch {
        response.writeHead(404).end('Not found');
      }
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
