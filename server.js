import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep positions even while tasks are elsewhere, so returns recover their order.
// Seed the current Task 011 order when upgrading an existing database.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
CREATE INDEX IF NOT EXISTS task_positions_project ON task_positions(project_id, position);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberedPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const savePosition = db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');

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
const projectSelect = `SELECT projects.id, projects.name, projects.archived, projects.default_priority,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0`;
const listProjects = db.prepare(`${projectSelect} GROUP BY projects.id ORDER BY projects.id`);
const getProject = db.prepare(`${projectSelect} WHERE projects.id = ? GROUP BY projects.id`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectJSON = (project) => ({ ...project, archived: Boolean(project.archived) });
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const getTask = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? AND id = ?');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, ?)`);
const importProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const importTask = db.prepare(`INSERT INTO tasks
  (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE project_id = ? AND id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const setNotes = db.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
const setDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE project_id = ? AND id = ?');
const taskJSON = (task) => ({ ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) });
const directoryTasks = db.prepare(`SELECT tasks.id, tasks.title, tasks.completed,
  tasks.priority, tasks.due_date, tasks.notes, tasks.deleted,
  projects.id AS project_id, projects.name AS project_name, projects.archived
  FROM tasks JOIN projects ON projects.id = tasks.project_id
  ORDER BY projects.id, tasks.position, tasks.id`);
const directoryJSON = () => directoryTasks.all().map((task) => ({
  ...taskJSON(task), archived: Boolean(task.archived),
}));
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function validPortableProject(document) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nonblank = (value) => typeof value === 'string' && value.trim() !== '';
  const priority = (value) => ['Low', 'Normal', 'High'].includes(value);
  if (!object(document) || document.format !== 'workboard-project' || document.version !== 1) return false;
  const project = document.project;
  return object(project) && nonblank(project.name) && typeof project.archived === 'boolean' &&
    priority(project.defaultPriority) && Array.isArray(project.tasks) && project.tasks.every((task) =>
      object(task) && nonblank(task.title) && typeof task.completed === 'boolean' &&
      priority(task.priority) && typeof task.dueDate === 'string' && validDueDate(task.dueDate) &&
      typeof task.notes === 'string' && typeof task.deleted === 'boolean');
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && path === '/api/task-directory') {
      return json(response, 200, directoryJSON());
    }
    if (request.method === 'POST' && path === '/api/task-directory/completion') {
      const input = await readJSON(request);
      if (typeof input?.completed !== 'boolean' ||
          !['active', 'archived'].includes(input.scope) ||
          !['all', 'open', 'completed', 'deleted'].includes(input.filter) ||
          !['all', 'Low', 'Normal', 'High'].includes(input.priority) ||
          typeof input.from !== 'string' || typeof input.through !== 'string' ||
          typeof input.query !== 'string') {
        return json(response, 400, { error: 'Invalid directory filters' });
      }
      const from = input.from.trim();
      const through = input.through.trim();
      if (!validDueDate(from) || !validDueDate(through)) {
        return json(response, 400, { error: 'Due range must use valid YYYY-MM-DD dates' });
      }
      if (from && through && from > through) {
        return json(response, 400, { error: 'Due from must not be after Due through' });
      }
      if (input.scope !== 'active' || input.filter === 'deleted') {
        return json(response, 409, { error: 'Only live tasks in active projects can be changed' });
      }
      const normalize = (value) => value.replace(/[ \t]+/g, ' ')
        .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      const query = normalize(input.query.trim());
      const results = transaction(() => {
        // Resolve the complete intersection from saved state within the write transaction.
        for (const task of directoryTasks.all()) {
          if (task.archived || task.deleted ||
              (input.filter !== 'all' && Boolean(task.completed) !== (input.filter === 'completed')) ||
              (input.priority !== 'all' && task.priority !== input.priority) ||
              ((from || through) && (!task.due_date ||
                (from && task.due_date < from) || (through && task.due_date > through))) ||
              !normalize(task.title).includes(query) || Boolean(task.completed) === input.completed) continue;
          updateTask.run(Number(input.completed), task.project_id, task.id);
        }
        return directoryJSON();
      });
      return json(response, 200, results);
    }
    if (request.method === 'GET' && path === '/api/projects') return json(response, 200, listProjects.all().map(projectJSON));
    if (request.method === 'POST' && path === '/api/projects/import') {
      let input;
      try { input = await readJSON(request); }
      catch { return json(response, 400, { error: 'Invalid project JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      let document;
      try { document = JSON.parse(input.document); }
      catch { return json(response, 400, { error: 'Invalid project JSON' }); }
      if (!validPortableProject(document)) return json(response, 400, { error: 'Invalid project JSON' });
      const projectId = transaction(() => {
        const project = document.project;
        const id = Number(importProject.run(name, Number(project.archived), project.defaultPriority).lastInsertRowid);
        project.tasks.forEach((task, index) => {
          const position = index + 1;
          const taskId = Number(importTask.run(id, task.title, Number(task.completed), task.priority,
            task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), position).lastInsertRowid);
          savePosition.run(taskId, id, position);
        });
        return id;
      });
      return json(response, 201, projectJSON(getProject.get(projectId)));
    }
    const exportApi = path.match(/^\/api\/projects\/(\d+)\/export$/);
    if (request.method === 'GET' && exportApi) {
      const project = getProject.get(exportApi[1]);
      if (!project) return json(response, 404, { error: 'Project not found' });
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(project.id).map((task) => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Textareas represent line breaks as LF; keep stored notes untouched.
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted),
          })),
        },
      };
      response.setHeader('Content-Disposition', 'attachment; filename="workboard-project.json"');
      return json(response, 200, document);
    }
    const projectApi = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectApi) {
      const project = getProject.get(projectApi[1]);
      return json(response, project ? 200 : 404, project ? projectJSON(project) : { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectApi) {
      if (!getProject.get(projectApi[1])) return json(response, 404, { error: 'Project not found' });
      const input = await readJSON(request);
      if (Object.hasOwn(input ?? {}, 'default_priority')) {
        if (getProject.get(projectApi[1]).archived) return json(response, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
        }
        setDefaultPriority.run(input.default_priority, projectApi[1]);
        return json(response, 200, projectJSON(getProject.get(projectApi[1])));
      }
      if (Object.hasOwn(input ?? {}, 'name')) {
        if (getProject.get(projectApi[1]).archived) return json(response, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectApi[1]);
        return json(response, 200, projectJSON(getProject.get(projectApi[1])));
      }
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), projectApi[1]);
      return json(response, 200, projectJSON(getProject.get(projectApi[1])));
    }
    const tasksApi = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksApi) {
      const [, projectId, taskId] = tasksApi;
      const project = getProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (request.method === 'POST' && !taskId) {
        const input = await readJSON(request);
        const currentProject = getProject.get(projectId);
        if (currentProject.archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const taskId = transaction(() => {
          const position = nextPosition.get(projectId).position;
          const result = createTask.run(projectId, title, currentProject.default_priority, position);
          const id = Number(result.lastInsertRowid);
          savePosition.run(id, projectId, position);
          return id;
        });
        return json(response, 201, taskJSON(getTask.get(projectId, taskId)));
      }
      if (request.method === 'PATCH' && taskId) {
        if (!getTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJSON(request);
        if (getProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (Object.hasOwn(input ?? {}, 'deleted')) {
          if (typeof input.deleted !== 'boolean') return json(response, 400, { error: 'Deletion state must be a boolean' });
          setDeleted.run(Number(input.deleted), projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (getTask.get(projectId, taskId).deleted) return json(response, 409, { error: 'Deleted task must be restored before editing' });
        if (Object.hasOwn(input ?? {}, 'notes')) {
          if (typeof input.notes !== 'string') return json(response, 400, { error: 'Task notes must be text' });
          setNotes.run(input.notes, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === Number(projectId)) {
            return json(response, 400, { error: 'Choose another active destination project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(response, 409, { error: 'Archived project' });
          transaction(() => {
            let position = rememberedPosition.get(taskId, destinationId)?.position;
            if (position === undefined) {
              position = nextPosition.get(destinationId).position;
              savePosition.run(taskId, destinationId, position);
            }
            moveTask.run(destinationId, position, projectId, taskId);
          });
          return json(response, 200, taskJSON(getTask.get(destinationId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || !validDueDate(date)) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setDueDate.run(date, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Task priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input ?? {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJSON(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, projectJSON(getProject.get(Number(result.lastInsertRowid))));
    }
    const asset = assets.get(path) || (path === '/task-directory' || /^\/projects\/\d+$/.test(path) ? assets.get('/') : null);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
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
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
