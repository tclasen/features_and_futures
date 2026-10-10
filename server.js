import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || resolve('data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )`);
const projectQuery = `SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total_count,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed_count
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id`);
const findProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJSON = task => ({ ...task, completed: Boolean(task.completed) });
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJSON(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      throw Object.assign(new Error('Request is too large'), { status: 413 });
    }
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all());
    }
    if (request.method === 'POST' && path === '/api/projects') {
      const input = await readJSON(request);
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, findProject.get(Number(result.lastInsertRowid)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      const project = findProject.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskJSON));
      }
      if (request.method === 'POST' && taskId === null) {
        const input = await readJSON(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return json(response, 201, taskJSON(findTask.get(projectId, Number(result.lastInsertRowid))));
      }
      if (request.method === 'PATCH' && taskId !== null) {
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        const input = await readJSON(request);
        if (findProject.get(projectId).archived) return json(response, 409, { error: 'Archived project' });
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJSON(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'PATCH' && projectMatch) {
      const id = Number(projectMatch[1]);
      if (!findProject.get(id)) return json(response, 404, { error: 'Project not found' });
      const input = await readJSON(request);
      if (typeof input?.archived !== 'boolean') return json(response, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), id);
      return json(response, 200, findProject.get(id));
    }
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return json(response, project ? 200 : 404, project || { error: 'Project not found' });
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
    if (!response.headersSent) json(response, 500, { error: 'Something went wrong' });
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
