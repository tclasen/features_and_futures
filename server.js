import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeDueDate, normalizeDueRange } from './due-date.js';
import { matchesTaskFilters } from './task-filters.js';
import { projectExport } from './project-export.js';
import { parseProjectImport } from './project-import.js';

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
    due_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    position INTEGER NOT NULL DEFAULT 0
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
// Notes are plain text; upgrades initialize only this new field.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Deletion reserves all fields and positions; earlier tasks remain live.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Preserve legacy creation order while allowing moved tasks to append independently of IDs.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;`);
}
database.exec('CREATE INDEX IF NOT EXISTS tasks_by_project_position ON tasks(project_id, position, id)');
// Remember positions even while tasks are away. Backfill the current order on
// upgrade; prior visits cannot be reconstructed from the previous schema.
database.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS remembered_positions_by_project
    ON task_project_positions(project_id, position);
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;
`);
const projectSelection = `
  SELECT projects.id, projects.name, projects.archived, projects.default_priority AS defaultPriority,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
`;
const listProjects = database.prepare(`${projectSelection} GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare(`${projectSelection} WHERE projects.id = ? GROUP BY projects.id`);
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const insertImportedProject = database.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const insertImportedTask = database.prepare(`
  INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const listDirectoryTasks = database.prepare(`
  SELECT tasks.id, tasks.title, tasks.completed, tasks.priority,
    tasks.due_date AS dueDate, tasks.notes, tasks.deleted,
    projects.id AS projectId, projects.name AS projectName, projects.archived
  FROM tasks JOIN projects ON projects.id = tasks.project_id
  ORDER BY projects.id, tasks.position, tasks.id
`);
const findTask = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare(`
  INSERT INTO tasks (project_id, title, priority, position)
  SELECT id, ?, default_priority,
    (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = projects.id)
  FROM projects WHERE id = ?
`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const updateTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE project_id = ? AND id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
const rememberCurrentPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?
`);
const rememberDestinationPosition = database.prepare(`
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1
  FROM task_project_positions WHERE project_id = ?
`);
const updateTaskProject = database.prepare(`
  UPDATE tasks SET project_id = ?,
    position = (SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?)
  WHERE project_id = ? AND id = ?
`);

function inTransaction(write) {
  database.exec('BEGIN');
  try {
    const result = write();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createTask(title, projectId) {
  return inTransaction(() => {
    const result = insertTask.run(title, projectId);
    rememberCurrentPosition.run(result.lastInsertRowid);
    return result.lastInsertRowid;
  });
}

function moveTask(taskId, sourceId, destinationId) {
  inTransaction(() => {
    rememberDestinationPosition.run(taskId, destinationId, destinationId);
    updateTaskProject.run(destinationId, taskId, destinationId, sourceId, taskId);
  });
}

function importProject(name, project) {
  return inTransaction(() => {
    const { lastInsertRowid: projectId } = insertImportedProject.run(name, Number(project.archived), project.defaultPriority);
    project.tasks.forEach((task, index) => {
      const result = insertImportedTask.run(projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes, Number(task.deleted), index + 1);
      rememberCurrentPosition.run(result.lastInsertRowid);
    });
    return projectId;
  });
}

function projectData(project) {
  return { ...project, archived: Boolean(project.archived) };
}

function taskData(task) {
  return { ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) };
}

function directoryData() {
  return listDirectoryTasks.all().map((task) => ({ ...taskData(task), archived: Boolean(task.archived) }));
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./due-date.js', import.meta.url))]],
  ['/search.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./search.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./task-filters.js', import.meta.url))]],
  ['/directory-order.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./directory-order.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request, maximumBytes = 16_384) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('Request body is too large');
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
    if (pathname === '/api/task-directory' && request.method === 'GET') {
      return json(response, 200, directoryData());
    }
    if (pathname === '/api/task-directory/completion' && request.method === 'POST') {
      let body;
      try {
        body = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      if (typeof body?.completed !== 'boolean'
        || !['Active', 'Archived'].includes(body.scope)
        || !['All', 'Open', 'Completed', 'Deleted'].includes(body.completion)
        || !['All', 'Low', 'Normal', 'High'].includes(body.priority)
        || typeof body.query !== 'string') {
        return json(response, 400, { error: 'Invalid directory filters' });
      }
      const range = normalizeDueRange(body.dueRange?.from, body.dueRange?.through);
      if (range.error) return json(response, 400, { error: range.error });
      if (body.scope === 'Archived' || body.completion === 'Deleted') {
        return json(response, 409, { error: 'Only live tasks in active projects can be changed' });
      }
      // Resolve matching ownership and state after input has been read, and write
      // in one transaction. Clients cannot include archived/deleted task IDs.
      const tasks = inTransaction(() => {
        for (const task of directoryData()) {
          if (!task.archived && !task.deleted && task.completed !== body.completed
            && matchesTaskFilters(task, body.completion, body.priority, range, body.query)) {
            updateTask.run(Number(body.completed), task.projectId, task.id);
          }
        }
        return directoryData();
      });
      return json(response, 200, tasks);
    }
    if (pathname === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all().map(projectData));
    }
    if (pathname === '/api/projects/import' && request.method === 'POST') {
      let body;
      try {
        // Portable exports can contain many tasks and must round-trip intact.
        body = await readJson(request, Infinity);
      } catch {
        return json(response, 400, { error: 'Invalid project JSON' });
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const project = parseProjectImport(body?.json);
      if (!project) return json(response, 400, { error: 'Invalid project JSON' });
      const projectId = importProject(name, project);
      return json(response, 201, projectData(findProject.get(projectId)));
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
    const exportRoute = pathname.match(/^\/api\/projects\/(\d+)\/export$/);
    if (request.method === 'GET' && exportRoute) {
      const project = findProject.get(exportRoute[1]);
      if (!project) return json(response, 404, { error: 'Project not found' });
      response.setHeader('Content-Disposition', 'attachment; filename="workboard-project.json"');
      return json(response, 200, projectExport(project, listTasks.all(project.id)));
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
        if (taskId && !findTask.get(projectId, taskId)) {
          return json(response, 404, { error: 'Task not found' });
        }
        if (!taskId) {
          const title = typeof body?.title === 'string' ? body.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const createdId = createTask(title, projectId);
          return json(response, 201, taskData(findTask.get(projectId, createdId)));
        }
        if (body && Object.hasOwn(body, 'deleted')) {
          if (['notes', 'destinationProjectId', 'dueDate', 'priority', 'title', 'completed'].some((field) => Object.hasOwn(body, field))) {
            return json(response, 400, { error: 'Deletion state and other task edits must be separate requests' });
          }
          if (typeof body.deleted !== 'boolean') {
            return json(response, 400, { error: 'Task deletion state must be a boolean' });
          }
          updateTaskDeleted.run(Number(body.deleted), projectId, taskId);
          return json(response, 200, taskData(findTask.get(projectId, taskId)));
        }
        if (findTask.get(projectId, taskId).deleted) {
          return json(response, 409, { error: 'Deleted task must be restored before editing' });
        }
        if (body && Object.hasOwn(body, 'notes')) {
          if (['destinationProjectId', 'dueDate', 'priority', 'title', 'completed'].some((field) => Object.hasOwn(body, field))) {
            return json(response, 400, { error: 'Notes and other task edits must be separate requests' });
          }
          if (typeof body.notes !== 'string') {
            return json(response, 400, { error: 'Task notes must be text' });
          }
          updateTaskNotes.run(body.notes, projectId, taskId);
          return json(response, 200, taskData(findTask.get(projectId, taskId)));
        }
        if (body && Object.hasOwn(body, 'destinationProjectId')) {
          if (['dueDate', 'priority', 'title', 'completed'].some((field) => Object.hasOwn(body, field))) {
            return json(response, 400, { error: 'Move and other task edits must be separate requests' });
          }
          const destinationId = body.destinationProjectId;
          if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === Number(projectId)) {
            return json(response, 400, { error: 'Choose another active destination project' });
          }
          const destination = findProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(response, 409, { error: 'Archived project cannot receive tasks' });
          // Save a first-visit position or reuse the remembered one atomically.
          moveTask(taskId, projectId, destinationId);
          return json(response, 200, taskData(findTask.get(destinationId, taskId)));
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
      const asset = assets.get(pathname === '/task-directory' || /^\/projects\/\d+$/.test(pathname) ? '/' : pathname);
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
