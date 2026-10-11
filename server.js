import { validDueDate } from './public/dates.js';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
)`);
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Keep positions even while tasks are away, so returns recover the established order.
database.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
);
INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const projectColumns = `SELECT p.id, p.name, p.archived, p.default_task_priority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed
  FROM projects p`;
const listProjects = database.prepare(`${projectColumns} ORDER BY p.position`);
const findProject = database.prepare(`${projectColumns} WHERE p.id = ?`);
const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
const listTasks = database.prepare(`SELECT t.id, t.title, t.completed, t.priority, t.due_date, t.notes
  FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position`);
const findTask = database.prepare('SELECT id, title, completed, priority, due_date, notes FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, priority) VALUES (?, ?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
const moveTask = database.prepare('UPDATE tasks SET project_id = ? WHERE project_id = ? AND id = ?');
const rememberTaskPosition = database.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?
  ON CONFLICT (task_id, project_id) DO NOTHING`);

function transaction(action) {
  database.exec('BEGIN');
  try {
    action();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/dates.js', ['public/dates.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function taskResult(task) {
  return { ...task, completed: Boolean(task.completed) };
}

function projectResult(project) {
  return { ...project, archived: Boolean(project.archived) };
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectResult));
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJson(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      insertProject.run(project.id, project.name);
      return json(response, 201, projectResult(findProject.get(project.id)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskResult));
      }
      if (request.method === 'POST' && !taskId) {
        const input = await readJson(request);
        const currentProject = findProject.get(projectId);
        if (currentProject.archived) return json(response, 409, { error: 'Archived project is read-only' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const task = { id: randomUUID(), title, completed: false };
        transaction(() => {
          insertTask.run(task.id, projectId, task.title, currentProject.default_task_priority);
          rememberTaskPosition.run(task.id, projectId, projectId);
        });
        return json(response, 201, taskResult(findTask.get(projectId, task.id)));
      }
      if (request.method === 'PATCH' && taskId) {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJson(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
        if (input && Object.hasOwn(input, 'destination_project_id')) {
          const destination = typeof input.destination_project_id === 'string'
            ? findProject.get(input.destination_project_id) : null;
          if (!destination || destination.id === projectId || destination.archived) {
            return json(response, 400, { error: 'Destination must be another active project' });
          }
          transaction(() => {
            rememberTaskPosition.run(taskId, destination.id, destination.id);
            moveTask.run(destination.id, projectId, taskId);
          });
          return json(response, 200, taskResult(findTask.get(destination.id, taskId)));
        }
        if (input && Object.hasOwn(input, 'notes')) {
          if (typeof input.notes !== 'string') {
            return json(response, 400, { error: 'Notes must be text' });
          }
          updateTaskNotes.run(input.notes, projectId, taskId);
          return json(response, 200, taskResult(findTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'due_date')) {
          const dueDate = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (dueDate === null || !validDueDate(dueDate)) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateTaskDueDate.run(dueDate, projectId, taskId);
          return json(response, 200, taskResult(findTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          updateTaskPriority.run(input.priority, projectId, taskId);
          return json(response, 200, taskResult(findTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskResult(findTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completed must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskResult(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      return json(response, project ? 200 : 404, project ? projectResult(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = projectMatch[1];
      if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      const input = await readJson(request);
      if (input && Object.hasOwn(input, 'default_task_priority')) {
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
        if (!['Low', 'Normal', 'High'].includes(input.default_task_priority)) {
          return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
        }
        updateDefaultTaskPriority.run(input.default_task_priority, projectId);
        return json(response, 200, projectResult(findProject.get(projectId)));
      }
      if (input && Object.hasOwn(input, 'name')) {
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project is read-only' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectId);
        return json(response, 200, projectResult(findProject.get(projectId)));
      }
      if (typeof input?.archived !== 'boolean') {
        return json(response, 400, { error: 'Archived must be a boolean' });
      }
      updateProject.run(Number(input.archived), projectId);
      return json(response, 200, projectResult(findProject.get(projectId)));
    }
    const asset = assets.get(path) || (/^\/projects\/[^/]+$/.test(path) ? assets.get('/') : null);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[1] });
      return response.end(readFileSync(resolve(root, asset[0])));
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Something went wrong' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
