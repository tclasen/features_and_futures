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
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
const setTaskCompletion = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
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
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
      return send(200, JSON.stringify(listProjects.all(archived)));
    }
    const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
    if (req.method === 'PATCH' && archiveMatch) {
      const project = getProject.get(archiveMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof payload?.archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid archive state' }));
      setArchived.run(payload.archived ? 1 : 0, project.id);
      return send(200, JSON.stringify({ ...project, archived: payload.archived ? 1 : 0 }));
    }
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
    const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'PATCH' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      renameProject.run(name, project.id);
      return send(200, JSON.stringify({ ...project, name }));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
    if (tasksMatch && (req.method === 'GET' || req.method === 'POST')) {
      const project = getProject.get(tasksMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (req.method === 'GET') return send(200, JSON.stringify(listTasks.all(tasksMatch[1])));
      if (project.archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
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
      const task = getTask.get(taskMatch[1]);
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      if (getProject.get(task.projectId).archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      if (typeof payload?.completed === 'boolean') {
        setTaskCompletion.run(payload.completed ? 1 : 0, task.id);
        return send(200, JSON.stringify({ ...task, completed: payload.completed ? 1 : 0 }));
      }
      if (['Low', 'Normal', 'High'].includes(payload?.priority)) {
        setTaskPriority.run(payload.priority, task.id);
        return send(200, JSON.stringify({ ...task, priority: payload.priority }));
      }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      renameTask.run(title, task.id);
      return send(200, JSON.stringify({ ...task, title }));
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
