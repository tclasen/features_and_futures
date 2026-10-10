import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
db.exec('PRAGMA foreign_keys = ON');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(res, 200, listProjects.all());
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const name = JSON.parse(body).name;
      if (typeof name !== 'string' || !name.trim()) {
        sendJson(res, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name.trim());
      sendJson(res, 201, { id: Number(result.lastInsertRowid), name: name.trim() });
    } catch {
      sendJson(res, 400, { error: 'Invalid request' });
    }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) { sendJson(res, 404, { error: 'Project not found' }); return; }
    sendJson(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    return;
  }
  if (req.method === 'POST' && tasksMatch) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const title = JSON.parse(body).title;
      const projectId = Number(tasksMatch[1]);
      if (typeof title !== 'string' || !title.trim()) { sendJson(res, 400, { error: 'Task title is required' }); return; }
      if (!getProject.get(projectId)) { sendJson(res, 404, { error: 'Project not found' }); return; }
      const result = createTask.run(projectId, title.trim());
      sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title: title.trim(), completed: false });
    } catch { sendJson(res, 400, { error: 'Invalid request' }); }
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { completed } = JSON.parse(body);
      if (typeof completed !== 'boolean') { sendJson(res, 400, { error: 'Invalid completion state' }); return; }
      const result = updateTask.run(completed ? 1 : 0, Number(taskMatch[2]), Number(taskMatch[1]));
      if (!result.changes) { sendJson(res, 404, { error: 'Task not found' }); return; }
      sendJson(res, 200, { completed });
    } catch { sendJson(res, 400, { error: 'Invalid request' }); }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (project) sendJson(res, 200, project);
    else sendJson(res, 404, { error: 'Project not found' });
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'public', 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      sendJson(res, 500, { error: 'Application unavailable' });
    }
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
