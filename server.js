import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p ORDER BY p.id`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const json = (res, status, value) => send(res, status, JSON.stringify(value));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return json(res, 200, listTasks.all(projectId));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return json(res, 403, { error: 'Archived project' });
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const data = JSON.parse(raw || '{}');
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = createTask.run(projectId, title);
        return json(res, 201, getTask.get(Number(result.lastInsertRowid)));
      } catch {
        return json(res, 400, { error: 'Invalid request' });
      }
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/?$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const id = Number(archiveMatch[1]);
      const project = getProject.get(id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (typeof data.name === 'string') {
        const name = data.name.trim();
        if (!name) return json(res, 400, { error: 'Project name is required' });
        if (project.archived) return json(res, 403, { error: 'Archived project' });
        renameProject.run(name, id);
      } else if (typeof data.archived === 'boolean') {
        setArchived.run(data.archived ? 1 : 0, id);
      } else return json(res, 400, { error: 'Invalid project update' });
      return json(res, 200, getProject.get(id));
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      const projectId = Number(taskMatch[1]);
      if (getProject.get(projectId).archived) return json(res, 403, { error: 'Archived project' });
      const taskId = Number(taskMatch[2]);
      if (typeof data.title === 'string') {
        const title = data.title.trim();
        if (!title) return json(res, 400, { error: 'Task title is required' });
        const result = renameTask.run(title, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else if (typeof data.completed === 'boolean') {
        const result = updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return json(res, 404, { error: 'Task not found' });
      } else return json(res, 400, { error: 'Invalid task update' });
      return json(res, 200, getTask.get(taskId));
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }

  const projectMatch = url.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || projectMatch)) {
    try {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'app.js')), 'text/javascript; charset=utf-8');
    } catch {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'styles.css')), 'text/css; charset=utf-8');
    } catch {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0');
