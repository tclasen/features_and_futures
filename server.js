import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || resolve('data/workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
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
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
const rememberPosition = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE project_id = ? AND id = ?`);
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
const saveDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const getTask = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
function taskJSON(task) { return { ...task, completed: Boolean(task.completed) }; }
const projectQuery = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && pathname === '/api/projects') return json(res, 200, listProjects.all());
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return json(res, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (req.method === 'PATCH' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return json(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      if (input && Object.hasOwn(input, 'default_priority')) {
        if (project.archived) return json(res, 409, { error: 'Archived project is read-only' });
        if (!['Low', 'Normal', 'High'].includes(input.default_priority)) return json(res, 400, { error: 'Invalid default task priority' });
        setDefaultPriority.run(input.default_priority, project.id);
        return json(res, 200, getProject.get(project.id));
      }
      if (input && Object.hasOwn(input, 'name')) {
        if (project.archived) return json(res, 409, { error: 'Archived project is read-only' });
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return json(res, 400, { error: 'Project name is required' });
        renameProject.run(name, project.id);
        return json(res, 200, getProject.get(project.id));
      }
      if (typeof input?.archived !== 'boolean') return json(res, 400, { error: 'Archive state must be a boolean' });
      archiveProject.run(Number(input.archived), projectMatch[1]);
      return json(res, 200, getProject.get(projectMatch[1]));
    }
    const tasksMatch = pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = getProject.get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) {
        return json(res, 200, listTasks.all(projectId).map(taskJSON));
      }
      if ((req.method === 'POST' && !taskId) || (req.method === 'PATCH' && taskId)) {
        if (project.archived) return json(res, 409, { error: 'Archived project is read-only' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) return json(res, 413, { error: 'Request too large' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        if (!taskId) {
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(res, 400, { error: 'Task title is required' });
          const result = transaction(() => {
            const created = createTask.run(projectId, title, project.default_priority, projectId);
            rememberPosition.run(created.lastInsertRowid, projectId, projectId);
            return created;
          });
          return json(res, 201, taskJSON(getTask.get(projectId, result.lastInsertRowid)));
        }
        if (!getTask.get(projectId, taskId)) return json(res, 404, { error: 'Task not found' });
        if (input && Object.hasOwn(input, 'destination_project_id')) {
          const destinationId = input.destination_project_id;
          if (!Number.isSafeInteger(destinationId) || destinationId === project.id) {
            return json(res, 400, { error: 'Choose another active destination project' });
          }
          const destination = getProject.get(destinationId);
          if (!destination) return json(res, 404, { error: 'Destination project not found' });
          if (destination.archived) return json(res, 409, { error: 'Archived projects cannot receive tasks' });
          transaction(() => {
            rememberPosition.run(taskId, destinationId, destinationId);
            moveTask.run(destinationId, taskId, destinationId, projectId, taskId);
          });
          return json(res, 200, taskJSON(getTask.get(destinationId, taskId)));
        }
        if (input && Object.hasOwn(input, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || (date !== '' && !validDate(date))) {
            return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          saveDueDate.run(date, projectId, taskId);
          return json(res, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return json(res, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
          return json(res, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (input && Object.hasOwn(input, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) return json(res, 400, { error: 'Invalid task priority' });
          prioritizeTask.run(input.priority, projectId, taskId);
          return json(res, 200, taskJSON(getTask.get(projectId, taskId)));
        }
        if (typeof input?.completed !== 'boolean') return json(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(res, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'POST' && pathname === '/api/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return json(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(pathname) ? '/' : pathname);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0] });
        return res.end(asset[1]);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'An unexpected error occurred' });
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
