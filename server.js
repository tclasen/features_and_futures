import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
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
// Keep a stable ordering slot for every project a task has visited. Seed
// existing tasks from their current positions without overwriting remembered slots.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
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
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const findTask = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE project_id = ? AND id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const taskJson = task => ({ ...task, completed: Boolean(task.completed) });
const projectSelect = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
  FROM projects p`;
const listProjects = db.prepare(`${projectSelect} ORDER BY p.id`);
const findProject = db.prepare(`${projectSelect} WHERE p.id = ?`);
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const page = readFileSync(new URL('./public/index.html', import.meta.url));
const script = readFileSync(new URL('./public/app.js', import.meta.url));
const styles = readFileSync(new URL('./public/style.css', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/projects') return send(res, 200, listProjects.all());
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks$/);
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
    if (req.method === 'GET' && tasksMatch) {
      if (!findProject.get(tasksMatch[1])) return send(res, 404, { error: 'Project not found' });
      return send(res, 200, listTasks.all(tasksMatch[1]).map(taskJson));
    }
    if ((req.method === 'POST' && (path === '/api/projects' || tasksMatch)) ||
        (req.method === 'PATCH' && (taskMatch || match))) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) return send(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); }
      catch { return send(res, 400, { error: 'Invalid JSON' }); }
      if (req.method === 'PATCH' && match) {
        const project = findProject.get(match[1]);
        if (!project) return send(res, 404, { error: 'Project not found' });
        if (input && Object.hasOwn(input, 'name')) {
          if (project.archived) return send(res, 409, { error: 'Archived project' });
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name) return send(res, 400, { error: 'Project name is required' });
          renameProject.run(name, match[1]);
        } else if (input && Object.hasOwn(input, 'default_priority')) {
          if (project.archived) return send(res, 409, { error: 'Archived project' });
          if (!['Low', 'Normal', 'High'].includes(input.default_priority)) {
            return send(res, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          setDefaultPriority.run(input.default_priority, match[1]);
        } else {
          if (typeof input?.archived !== 'boolean') return send(res, 400, { error: 'Archived must be a boolean' });
          archiveProject.run(Number(input.archived), match[1]);
        }
        return send(res, 200, findProject.get(match[1]));
      }
      if (tasksMatch) {
        const project = findProject.get(tasksMatch[1]);
        if (!project) return send(res, 404, { error: 'Project not found' });
        if (project.archived) return send(res, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return send(res, 400, { error: 'Task title is required' });
        const result = transaction(() => {
          const position = nextPosition.get(project.id).position;
          const inserted = insertTask.run(project.id, title, project.default_priority, position);
          savePosition.run(inserted.lastInsertRowid, project.id, position);
          return inserted;
        });
        return send(res, 201, taskJson(findTask.get(tasksMatch[1], result.lastInsertRowid)));
      }
      if (taskMatch) {
        if (!findTask.get(taskMatch[1], taskMatch[2])) return send(res, 404, { error: 'Task not found' });
        if (findProject.get(taskMatch[1]).archived) return send(res, 409, { error: 'Archived project' });
        if (input && Object.hasOwn(input, 'destination_project_id')) {
          const destination = Number.isSafeInteger(input.destination_project_id)
            ? findProject.get(input.destination_project_id) : null;
          if (!destination || destination.id === Number(taskMatch[1])) {
            return send(res, 400, { error: 'Choose another active project' });
          }
          if (destination.archived) return send(res, 409, { error: 'Archived project' });
          transaction(() => {
            let slot = rememberedPosition.get(taskMatch[2], destination.id);
            if (!slot) {
              slot = nextPosition.get(destination.id);
              savePosition.run(taskMatch[2], destination.id, slot.position);
            }
            moveTask.run(destination.id, slot.position, taskMatch[1], taskMatch[2]);
          });
          return send(res, 200, taskJson(findTask.get(destination.id, taskMatch[2])));
        } else if (input && Object.hasOwn(input, 'title')) {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) return send(res, 400, { error: 'Task title is required' });
          renameTask.run(title, taskMatch[1], taskMatch[2]);
        } else if (input && Object.hasOwn(input, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(input.priority)) {
            return send(res, 400, { error: 'Priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(input.priority, taskMatch[1], taskMatch[2]);
        } else if (input && Object.hasOwn(input, 'due_date')) {
          const date = typeof input.due_date === 'string' ? input.due_date.trim() : null;
          if (date === null || (date !== '' && !validDate(date))) {
            return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          }
          setDueDate.run(date, taskMatch[1], taskMatch[2]);
        } else {
          if (typeof input?.completed !== 'boolean') return send(res, 400, { error: 'Completion must be a boolean' });
          updateTask.run(Number(input.completed), taskMatch[1], taskMatch[2]);
        }
        return send(res, 200, taskJson(findTask.get(taskMatch[1], taskMatch[2])));
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(res, 201, findProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      return send(res, 200, page, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/app.js') return send(res, 200, script, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && path === '/style.css') return send(res, 200, styles, 'text/css; charset=utf-8');
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong' });
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
