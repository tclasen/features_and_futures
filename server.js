import { isValidDueDate } from './public/dates.js';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_by_project ON tasks(project_id, id)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep positions reserved even while a task belongs to another project.
// Seed existing tasks with their current positions when upgrading a database.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
CREATE INDEX IF NOT EXISTS task_positions_by_project ON task_positions(project_id, position);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const projectQuery = `SELECT projects.id, projects.name, projects.archived, projects.default_priority AS defaultPriority,
  COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
const listProjects = db.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
const findProject = db.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
const projectData = project => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY position, id');
const findTask = db.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const rememberCreatedPosition = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
const rememberDestinationPosition = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE project_id = ? AND task_id = ?)
  WHERE project_id = ? AND id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const taskData = task => ({ ...task, completed: Boolean(task.completed) });

function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/dates.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/dates.js', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
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

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      return json(response, project ? 200 : 404, project ? projectData(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectMatch) {
      if (!findProject.get(projectMatch[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readBody(request);
      const hasName = Object.hasOwn(input ?? {}, 'name');
      const hasArchive = Object.hasOwn(input ?? {}, 'archived');
      const hasDefaultPriority = Object.hasOwn(input ?? {}, 'defaultPriority');
      if ((!hasName && !hasArchive && !hasDefaultPriority) || (hasArchive && typeof input.archived !== 'boolean')) {
        return json(response, 400, { error: 'Archive state must be a boolean' });
      }
      if ((hasName || hasDefaultPriority) && findProject.get(projectMatch[1]).archived) {
        return json(response, 409, { error: 'Archived project' });
      }
      if (hasDefaultPriority && !['Low', 'Normal', 'High'].includes(input.defaultPriority)) {
        return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (hasName) {
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectMatch[1]);
      }
      if (hasArchive) updateProject.run(Number(input.archived), projectMatch[1]);
      if (hasDefaultPriority) updateDefaultPriority.run(input.defaultPriority, projectMatch[1]);
      return json(response, 200, projectData(findProject.get(projectMatch[1])));
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readBody(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectData(findProject.get(Number(result.lastInsertRowid))));
    }
    const moveMatch = path.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
    if (request.method === 'POST' && moveMatch) {
      const [, projectId, taskId] = moveMatch;
      const input = await readBody(request);
      const source = findProject.get(projectId);
      if (!source) return json(response, 404, { error: 'Project not found' });
      if (source.archived) return json(response, 409, { error: 'Archived project' });
      if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
      if (!Number.isSafeInteger(input?.destinationProjectId) || input.destinationProjectId < 1 ||
          input.destinationProjectId === Number(projectId)) {
        return json(response, 400, { error: 'Choose another active destination project' });
      }
      const destination = findProject.get(input.destinationProjectId);
      if (!destination) return json(response, 404, { error: 'Destination project not found' });
      if (destination.archived) return json(response, 409, { error: 'Archived project' });
      transaction(() => {
        rememberDestinationPosition.run(taskId, destination.id, destination.id);
        moveTask.run(destination.id, destination.id, taskId, projectId, taskId);
      });
      return json(response, 200, taskData(findTask.get(destination.id, taskId)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if (request.method === 'POST' && !taskId) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        const input = await readBody(request);
        const currentProject = findProject.get(projectId);
        if (currentProject.archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = transaction(() => {
          const inserted = insertTask.run(projectId, title, currentProject.defaultPriority, projectId);
          rememberCreatedPosition.run(inserted.lastInsertRowid);
          return inserted;
        });
        return json(response, 201, taskData(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId) {
        if (project.archived) return json(response, 409, { error: 'Archived project' });
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readBody(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const hasTitle = Object.hasOwn(input ?? {}, 'title');
        const hasCompletion = Object.hasOwn(input ?? {}, 'completed');
        const hasPriority = Object.hasOwn(input ?? {}, 'priority');
        const hasDueDate = Object.hasOwn(input ?? {}, 'dueDate');
        if ((!hasTitle && !hasCompletion && !hasPriority && !hasDueDate) || (hasCompletion && typeof input.completed !== 'boolean')) {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        if (hasPriority && !['Low', 'Normal', 'High'].includes(input.priority)) {
          return json(response, 400, { error: 'Task priority must be Low, Normal, or High' });
        }
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (hasTitle && !title) return json(response, 400, { error: 'Task title is required' });
        const dueDate = typeof input?.dueDate === 'string' ? input.dueDate.trim() : null;
        if (hasDueDate && (dueDate === null || !isValidDueDate(dueDate))) {
          return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
        if (hasTitle) renameTask.run(title, projectId, taskId);
        if (hasCompletion) updateTask.run(Number(input.completed), projectId, taskId);
        if (hasPriority) updatePriority.run(input.priority, projectId, taskId);
        if (hasDueDate) updateDueDate.run(dueDate, projectId, taskId);
        return json(response, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
      if (asset) {
        response.writeHead(200, { 'Content-Type': asset[0] });
        return response.end(asset[1]);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
