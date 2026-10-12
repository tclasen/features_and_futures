import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeDueDate } from './due-date.js';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS tasks_by_project ON tasks(project_id, id);
`);
// Existing projects stay active when upgrading a projects/tasks database.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Project defaults apply only to future tasks; existing task priorities stay intact.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Backfill existing tasks without changing their IDs, order, or completion.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Existing tasks have no due date; this migration preserves every other field.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const projectSelection = `
  SELECT projects.id, projects.name, projects.archived, projects.default_priority AS defaultPriority,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
`;
const listProjects = database.prepare(`${projectSelection} GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectSelection} WHERE projects.id = ? GROUP BY projects.id`);
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare(`
  INSERT INTO tasks (project_id, title, priority)
  SELECT id, ?, default_priority FROM projects WHERE id = ?
`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');

function projectData(project) {
  return { ...project, archived: Boolean(project.archived) };
}

function taskData(task) {
  return { ...task, completed: Boolean(task.completed) };
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./due-date.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    if (pathname === '/api/projects' && request.method === 'POST') {
      let body;
      try {
        body = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectData(findProject.get(result.lastInsertRowid)));
    }
    const projectRoute = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      return project ? json(response, 200, projectData(project)) : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'PATCH' && projectRoute) {
      const projectId = projectRoute[1];
      if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      let body;
      try {
        body = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      if (body && Object.hasOwn(body, 'defaultPriority')) {
        if (Object.hasOwn(body, 'name') || Object.hasOwn(body, 'archived')) {
          return json(response, 400, { error: 'Default priority, rename, and archive must be separate requests' });
        }
        if (findProject.get(projectId).archived) {
          return json(response, 409, { error: 'Archived project cannot be changed' });
        }
        if (!['Low', 'Normal', 'High'].includes(body.defaultPriority)) {
          return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
        }
        updateProjectDefaultPriority.run(body.defaultPriority, projectId);
        return json(response, 200, projectData(findProject.get(projectId)));
      }
      if (body && Object.hasOwn(body, 'name')) {
        if (Object.hasOwn(body, 'archived')) {
          return json(response, 400, { error: 'Rename and archive must be separate requests' });
        }
        // Check after reading input so a concurrent archive cannot allow a rename.
        if (findProject.get(projectId).archived) {
          return json(response, 409, { error: 'Archived project cannot be changed' });
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectId);
        return json(response, 200, projectData(findProject.get(projectId)));
      }
      if (typeof body?.archived !== 'boolean') {
        return json(response, 400, { error: 'Project archive state must be a boolean' });
      }
      updateProjectArchive.run(Number(body.archived), projectId);
      return json(response, 200, projectData(findProject.get(projectId)));
    }
    const tasksRoute = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksRoute) {
      const [, projectId, taskId] = tasksRoute;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (!taskId && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskData));
      }
      if ((!taskId && request.method === 'POST') || (taskId && request.method === 'PATCH')) {
        if (project.archived) return json(response, 409, { error: 'Archived project cannot be changed' });
        if (taskId && !findTask.get(projectId, taskId)) {
          return json(response, 404, { error: 'Task not found' });
        }
        let body;
        try {
          body = await readJson(request);
        } catch {
          return json(response, 400, { error: 'Invalid JSON request' });
        }
        // Recheck after reading the body: an archive request may have completed
        // while this request was awaiting input. No awaits occur before the write.
        if (findProject.get(projectId).archived) {
          return json(response, 409, { error: 'Archived project cannot be changed' });
        }
        if (!taskId) {
          const title = typeof body?.title === 'string' ? body.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = insertTask.run(title, projectId);
          return json(response, 201, taskData(findTask.get(projectId, result.lastInsertRowid)));
        }
        if (body && Object.hasOwn(body, 'dueDate')) {
          if (['priority', 'title', 'completed'].some((field) => Object.hasOwn(body, field))) {
            return json(response, 400, { error: 'Due date and other task edits must be separate requests' });
          }
          const dueDate = normalizeDueDate(body.dueDate);
          if (dueDate === null) {
            return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          updateTaskDueDate.run(dueDate, projectId, taskId);
          return json(response, 200, taskData(findTask.get(projectId, taskId)));
        }
        if (body && Object.hasOwn(body, 'priority')) {
          if (Object.hasOwn(body, 'title') || Object.hasOwn(body, 'completed')) {
            return json(response, 400, { error: 'Priority, rename, and completion must be separate requests' });
          }
          if (!['Low', 'Normal', 'High'].includes(body.priority)) {
            return json(response, 400, { error: 'Task priority must be Low, Normal, or High' });
          }
          updateTaskPriority.run(body.priority, projectId, taskId);
          return json(response, 200, taskData(findTask.get(projectId, taskId)));
        }
        if (body && Object.hasOwn(body, 'title')) {
          if (Object.hasOwn(body, 'completed')) {
            return json(response, 400, { error: 'Rename and completion must be separate requests' });
          }
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskData(findTask.get(projectId, taskId)));
        }
        if (typeof body?.completed !== 'boolean') {
          return json(response, 400, { error: 'Task completion must be a boolean' });
        }
        updateTask.run(Number(body.completed), projectId, taskId);
        return json(response, 200, taskData(findTask.get(projectId, taskId)));
      }
    }
    if (request.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(pathname) ? '/' : pathname);
      if (asset) {
        response.writeHead(200, { 'Content-Type': asset[0] });
        return response.end(asset[1]);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
