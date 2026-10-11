import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'data/workboard.sqlite'));
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?');
const setTaskCompletion = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const indexHtml = await readFile(resolve(root, 'public/index.html'));
const appJs = await readFile(resolve(root, 'public/app.js'));
const appCss = await readFile(resolve(root, 'public/style.css'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
    if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const id = randomUUID();
      insertProject.run(id, name, Date.now());
      return send(201, JSON.stringify({ id, name }));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
    if (tasksMatch && (req.method === 'GET' || req.method === 'POST')) {
      const project = getProject.get(tasksMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (req.method === 'GET') return send(200, JSON.stringify(listTasks.all(tasksMatch[1])));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: 0 };
      insertTask.run(task.id, task.projectId, task.title, Date.now());
      return send(201, JSON.stringify(task));
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (req.method === 'PATCH' && taskMatch) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof payload?.completed !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid completion state' }));
      const task = getTask.get(taskMatch[1]);
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      setTaskCompletion.run(payload.completed ? 1 : 0, task.id);
      return send(200, JSON.stringify({ ...task, completed: payload.completed ? 1 : 0 }));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) return send(200, indexHtml, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/app.js') return send(200, appJs, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/style.css') return send(200, appCss, 'text/css; charset=utf-8');
    return send(404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    return send(500, JSON.stringify({ error: 'Internal server error' }));
  }
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
