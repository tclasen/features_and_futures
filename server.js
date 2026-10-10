import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    default_task_priority TEXT NOT NULL DEFAULT 'Normal',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    task_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'task_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN task_order INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET task_order = id');
}

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

const indexHtml = await readFile(join(root, 'index.html'));
const styles = await readFile(join(root, 'styles.css'));
const client = await readFile(join(root, 'client.js'));

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    sendJson(response, 200, database.prepare(`
      SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
        COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
    `).all(archived));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const payload = JSON.parse(body);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: 'Invalid JSON' });
        return;
      }
      throw error;
    }
    return;
  }

  if (url.pathname.startsWith('/api/projects/')) {
    const route = url.pathname.slice('/api/projects/'.length).split('/');
    const id = Number(route[0]);
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name, archived, default_task_priority AS defaultTaskPriority FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (route.length === 2 && route[1] === 'tasks') {
      if (request.method === 'GET') {
        sendJson(response, 200, database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY task_order, id').all(id));
        return;
      }
      if (request.method === 'POST') {
        if (project.archived) {
          sendJson(response, 409, { error: 'Archived projects cannot have new tasks' });
          return;
        }
        let body = '';
        for await (const chunk of request) body += chunk;
        try {
          const payload = JSON.parse(body);
          const title = typeof payload.title === 'string' ? payload.title.trim() : '';
          if (!title) {
            sendJson(response, 400, { error: 'Task title is required' });
            return;
          }
          const priority = project.defaultTaskPriority;
          const order = database.prepare('SELECT COALESCE(MAX(task_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(id).next;
          const result = database.prepare('INSERT INTO tasks (project_id, title, priority, task_order) VALUES (?, ?, ?, ?)').run(id, title, priority, order);
          sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId: id, title, completed: 0, priority });
        } catch (error) {
          if (error instanceof SyntaxError) {
            sendJson(response, 400, { error: 'Invalid JSON' });
            return;
          }
          throw error;
        }
        return;
      }
    }
    if (route.length === 4 && route[1] === 'tasks' && route[3] === 'move' && request.method === 'POST') {
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot move tasks' });
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const payload = JSON.parse(body);
        const destinationId = Number(payload.destinationProjectId);
        const taskId = Number(route[2]);
        const destination = Number.isInteger(destinationId) && destinationId > 0
          ? database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(destinationId) : undefined;
        const task = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, id);
        if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
        if (!destination || destination.archived || destinationId === id) {
          sendJson(response, 400, { error: 'Invalid destination project' });
          return;
        }
        const order = database.prepare('SELECT COALESCE(MAX(task_order), 0) + 1 AS next FROM tasks WHERE project_id = ?').get(destinationId).next;
        database.prepare('UPDATE tasks SET project_id = ?, task_order = ? WHERE id = ? AND project_id = ?').run(destinationId, order, taskId, id);
        sendJson(response, 200, { id: taskId, projectId: destinationId });
      } catch (error) {
        if (error instanceof SyntaxError) { sendJson(response, 400, { error: 'Invalid JSON' }); return; }
        throw error;
      }
      return;
    }
    if (route.length === 3 && route[1] === 'tasks' && request.method === 'PATCH') {
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
        return;
      }
      const taskId = Number(route[2]);
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const payload = JSON.parse(body);
        if (!Number.isInteger(taskId) || taskId < 1) {
          sendJson(response, 400, { error: 'Invalid task update' });
          return;
        }
        const task = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?').get(taskId, id);
        if (!task) {
          sendJson(response, 404, { error: 'Task not found' });
          return;
        }
        if (typeof payload.completed === 'boolean') {
          database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(payload.completed ? 1 : 0, taskId, id);
          sendJson(response, 200, { id: taskId, projectId: id, title: task.title, completed: payload.completed ? 1 : 0 });
          return;
        }
        if (['Low', 'Normal', 'High'].includes(payload.priority)) {
          database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?').run(payload.priority, taskId, id);
          sendJson(response, 200, { id: taskId, projectId: id, title: task.title, completed: task.completed, priority: payload.priority });
          return;
        }
        if (typeof payload.dueDate === 'string') {
          const dueDate = payload.dueDate.trim();
          if (dueDate && !isValidDueDate(dueDate)) {
            sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
            return;
          }
          const savedDate = dueDate || null;
          database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(savedDate, taskId, id);
          sendJson(response, 200, { id: taskId, projectId: id, dueDate: savedDate });
          return;
        }
        if (typeof payload.title === 'string') {
          const title = payload.title.trim();
          if (!title) {
            sendJson(response, 400, { error: 'Task title is required' });
            return;
          }
          database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, id);
          sendJson(response, 200, { id: taskId, projectId: id, title, completed: task.completed });
          return;
        }
        sendJson(response, 400, { error: 'Invalid task update' });
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Invalid JSON' });
          return;
        }
        throw error;
      }
      return;
    }
    if (route.length !== 1) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, project);
      return;
    }
    if (request.method === 'PATCH') {
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const payload = JSON.parse(body);
        if (typeof payload.archived === 'boolean') {
          database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(payload.archived ? 1 : 0, id);
          sendJson(response, 200, { ...project, archived: payload.archived ? 1 : 0 });
          return;
        }
        if (['Low', 'Normal', 'High'].includes(payload.defaultTaskPriority)) {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change the default task priority' });
            return;
          }
          database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?').run(payload.defaultTaskPriority, id);
          sendJson(response, 200, { ...project, defaultTaskPriority: payload.defaultTaskPriority });
          return;
        }
        if (typeof payload.name === 'string') {
          const name = payload.name.trim();
          if (!name) {
            sendJson(response, 400, { error: 'Project name is required' });
            return;
          }
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
            return;
          }
          database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
          sendJson(response, 200, { ...project, name });
          return;
        }
        sendJson(response, 400, { error: 'Invalid project update' });
        return;
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Invalid JSON' });
          return;
        }
        throw error;
      }
      return;
    }
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    response.end(styles);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/client.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(client);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
