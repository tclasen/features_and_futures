import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeDueDate } from './due-date.js';
import { validateProjectDocument } from './project-import.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;`);
}
// Keep reserved positions even while tasks belong to another project. Seeding
// from current positions preserves the order of databases created before this feature.
db.exec(`BEGIN;
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;`);
const projectQuery = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted = 0) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted = 0 AND completed = 1) AS completed
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id ASC`);
const findProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const insertImportedProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const insertImportedTask = db.prepare(`INSERT INTO tasks
  (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const findTask = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))`);
const rememberPosition = db.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
const reserveDestinationPosition = db.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))
  ON CONFLICT (task_id, project_id) DO NOTHING`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?)
  WHERE project_id = ? AND id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const setNotes = db.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
const setDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE project_id = ? AND id = ?');
const taskJSON = task => ({ ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) });
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
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
  ['/due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./due-date.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJSON(request, maxBytes = 65536) {
  // Decode across chunk boundaries so imported Unicode is never split into
  // replacement characters when a request spans multiple network reads.
  request.setEncoding('utf8');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && pathname === '/api/projects') return json(response, 200, listProjects.all());
    if (request.method === 'POST' && pathname === '/api/projects/import') {
      let input;
      try { input = await readJSON(request, Infinity); }
      catch { return json(response, 400, { error: 'Invalid project JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const imported = typeof input.document === 'string' ? validateProjectDocument(input.document) : null;
      if (!imported) return json(response, 400, { error: 'Invalid project JSON' });
      const projectId = transaction(() => {
        const result = insertImportedProject.run(name, Number(imported.archived), imported.defaultPriority);
        const id = result.lastInsertRowid;
        imported.tasks.forEach((task, index) => {
          const inserted = insertImportedTask.run(id, task.title, Number(task.completed), task.priority,
            task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), index + 1);
          rememberPosition.run(inserted.lastInsertRowid);
        });
        return id;
      });
      return json(response, 201, findProject.get(projectId));
    }
    const exportMatch = pathname.match(/^\/api\/projects\/(\d+)\/export$/);
    if (request.method === 'GET' && exportMatch) {
      const project = findProject.get(exportMatch[1]);
      if (!project) return json(response, 404, { error: 'Project not found' });
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(project.id).map(task => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Textarea line breaks are portable LF; leave the stored notes intact.
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted),
          })),
        },
      };
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
      });
      return response.end(JSON.stringify(document, null, 2));
    }
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      return json(response, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (request.method === 'POST' && pathname === '/api/projects') {
      const input = await readJSON(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, findProject.get(result.lastInsertRowid));
    }
    if (request.method === 'PATCH' && projectMatch) {
      const projectId = projectMatch[1];
      if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      const input = await readJSON(request);
      if (Object.hasOwn(input || {}, 'default_priority')) {
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
          return json(response, 400, { error: 'Default priority must be Low, Normal, or High' });
        }
        setDefaultPriority.run(input.default_priority, projectId);
        return json(response, 200, findProject.get(projectId));
      }
      if (Object.hasOwn(input || {}, 'name')) {
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        renameProject.run(name, projectId);
        return json(response, 200, findProject.get(projectId));
      }
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), projectId);
      return json(response, 200, findProject.get(projectId));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && !taskId) {
        return json(response, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (request.method === 'POST' && !taskId) {
        const input = await readJSON(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = transaction(() => {
          const inserted = insertTask.run(projectId, title, findProject.get(projectId).default_priority, projectId);
          rememberPosition.run(inserted.lastInsertRowid);
          return inserted;
        });
        return json(response, 201, taskJSON(findTask.get(projectId, result.lastInsertRowid)));
      }
      if (request.method === 'PATCH' && taskId) {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJSON(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (Object.hasOwn(input || {}, 'deleted')) {
          if (typeof input.deleted !== 'boolean') return json(response, 400, { error: 'Deletion state must be a boolean' });
          setDeleted.run(Number(input.deleted), projectId, taskId);
          return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
        }
        if (findTask.get(projectId, taskId).deleted) return json(response, 409, { error: 'Restore task before editing' });
        if (Object.hasOwn(input || {}, 'notes')) {
          if (typeof input.notes !== 'string') return json(response, 400, { error: 'Task notes must be text' });
          setNotes.run(input.notes, projectId, taskId);
          return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || destinationId === Number(projectId)) {
            return json(response, 400, { error: 'Choose another active destination project' });
          }
          const destination = findProject.get(destinationId);
          if (!destination) return json(response, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(response, 409, { error: 'Archived project' });
          transaction(() => {
            reserveDestinationPosition.run(taskId, destinationId, destinationId);
            moveTask.run(destinationId, taskId, destinationId, projectId, taskId);
          });
          return json(response, 200, taskJSON(findTask.get(destinationId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'due_date')) {
          const date = normalizeDueDate(input.due_date);
          if (date === null) return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          setDueDate.run(date, projectId, taskId);
          return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return json(response, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, projectId, taskId);
          return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
        }
        if (Object.hasOwn(input || {}, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
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
    if (error.status) return json(response, error.status, { error: error.message });
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
