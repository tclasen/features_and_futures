import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(isAbsolute(dbPath) ? dbPath : join(process.cwd(), dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, JSON.stringify(listProjects.all()));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (typeof body.archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid archive state' }));
      const result = setArchived.run(body.archived ? 1 : 0, Number(archiveMatch[1]));
      return result.changes ? send(200, JSON.stringify(getProject.get(Number(archiveMatch[1])))) : send(404, JSON.stringify({ error: 'Not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskMatch && req.method === 'GET') {
    return send(200, JSON.stringify(listTasks.all(Number(taskMatch[1]))));
  }
  if (taskMatch && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const owner = getProject.get(Number(taskMatch[1]));
      if (!owner) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (owner.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      const result = createTask.run(Number(taskMatch[1]), title);
      return send(201, JSON.stringify(getTask.get(Number(result.lastInsertRowid), Number(taskMatch[1]))));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskUpdateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdateMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const owner = getProject.get(Number(taskUpdateMatch[1]));
      if (!owner) return send(404, JSON.stringify({ error: 'Not found' }));
      if (owner.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      const taskId = Number(taskUpdateMatch[2]);
      let result;
      if (typeof body.completed === 'boolean') {
        result = updateTask.run(body.completed ? 1 : 0, taskId, Number(taskUpdateMatch[1]));
      } else if (typeof body.priority === 'string' && ['Low', 'Normal', 'High'].includes(body.priority)) {
        result = updatePriority.run(body.priority, taskId, Number(taskUpdateMatch[1]));
      } else if (typeof body.title === 'string' && body.title.trim()) {
        renameTask.run(body.title.trim(), taskId, Number(taskUpdateMatch[1]));
        result = { changes: db.prepare('SELECT changes() AS count').get().count };
      } else if (typeof body.title === 'string') {
        return send(400, JSON.stringify({ error: 'Task title is required' }));
      } else {
        return send(400, JSON.stringify({ error: 'Invalid task update' }));
      }
      return result.changes ? send(200, JSON.stringify(getTask.get(taskId, Number(taskUpdateMatch[1])))) : send(404, JSON.stringify({ error: 'Not found' }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const id = Number(projectMatch[1]);
      const project = getProject.get(id);
      if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
      if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      renameProject.run(name, id);
      return send(200, JSON.stringify(getProject.get(id)));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'index.html'));
      return send(200, html, 'text/html; charset=utf-8');
    } catch {
      return send(500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    try {
      const script = await readFile(join(root, 'app.js'));
      return send(200, script, 'text/javascript; charset=utf-8');
    } catch {
      return send(404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
  return send(404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
