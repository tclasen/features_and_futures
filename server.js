import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
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
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);`);
// Existing databases predate archive support; retain their projects and tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Tasks created before priority support keep their identity and default to Normal.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults only affect future tasks, never existing task priorities.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const taskJson = task => ({ ...task, completed: Boolean(task.completed) });
const projectSelect = `SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
  FROM projects p`;
const listProjects = db.prepare(`${projectSelect} ORDER BY p.id`);
const findProject = db.prepare(`${projectSelect} WHERE p.id = ?`);
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectJson = project => ({ ...project, archived: Boolean(project.archived) });

const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
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
      const error = new Error('Request is too large');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, listProjects.all().map(projectJson));
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, projectJson(findProject.get(Number(result.lastInsertRowid))));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (project.archived && ['POST', 'PATCH'].includes(request.method)) {
        return json(response, 409, { error: 'Archived project cannot be changed' });
      }
      if (taskId === null && request.method === 'GET') {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if (taskId === null && request.method === 'POST') {
        const body = await readJson(request);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title, project.default_priority);
        return json(response, 201, taskJson(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (taskId !== null && request.method === 'PATCH') {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const body = await readJson(request);
        const changes = ['title', 'completed', 'priority'].filter(key => Object.hasOwn(body ?? {}, key));
        if (changes.length > 1) {
          return json(response, 400, { error: 'Task edits must be separate changes' });
        }
        if (changes[0] === 'priority') {
          if (!['Low', 'Normal', 'High'].includes(body.priority)) {
            return json(response, 400, { error: 'Task priority must be Low, Normal, or High' });
          }
          prioritizeTask.run(body.priority, projectId, taskId);
        } else if (changes[0] === 'title') {
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          renameTask.run(title, projectId, taskId);
        } else {
          if (typeof body?.completed !== 'boolean') {
            return json(response, 400, { error: 'Task completion must be a boolean' });
          }
          updateTask.run(Number(body.completed), projectId, taskId);
        }
        return json(response, 200, taskJson(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch && ['GET', 'PATCH'].includes(request.method)) {
      const projectId = Number(projectMatch[1]);
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'PATCH') {
        const body = await readJson(request);
        const changes = ['name', 'archived', 'default_priority'].filter(key => Object.hasOwn(body ?? {}, key));
        if (changes.length > 1) {
          return json(response, 400, { error: 'Project edits must be separate changes' });
        }
        if (changes[0] === 'default_priority') {
          if (project.archived) {
            return json(response, 409, { error: 'Archived project cannot be changed' });
          }
          if (!['Low', 'Normal', 'High'].includes(body.default_priority)) {
            return json(response, 400, { error: 'Default task priority must be Low, Normal, or High' });
          }
          setDefaultPriority.run(body.default_priority, projectId);
        } else if (changes[0] === 'name') {
          if (project.archived) {
            return json(response, 409, { error: 'Archived project cannot be changed' });
          }
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) return json(response, 400, { error: 'Project name is required' });
          renameProject.run(name, projectId);
        } else {
          if (typeof body?.archived !== 'boolean') {
            return json(response, 400, { error: 'Project archive state must be a boolean' });
          }
          archiveProject.run(Number(body.archived), projectId);
        }
      }
      return json(response, 200, projectJson(findProject.get(projectId)));
    }
    if (request.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path) || assets.has(path))) {
      const [file, contentType] = assets.get(path) || ['index.html', 'text/html; charset=utf-8'];
      const contents = await readFile(new URL(`./public/${file}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': contentType });
      return response.end(contents);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
