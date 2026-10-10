import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
const listProjects = db.prepare('SELECT p.id, p.name, p.archived, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.created_at, p.rowid');
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const app = await readFile(new URL('./index.html', import.meta.url));

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Request failed:', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal server error' }));
  });
});

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'PATCH' && renameMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(renameMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
    renameProject.run(name, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (req.method === 'PATCH' && archiveMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(archiveMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    setArchived.run(input.archived ? 1 : 0, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return send(201, JSON.stringify(project));
  }
  const priorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/priority$/);
  if (req.method === 'PATCH' && priorityMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(priorityMatch[1]);
    const taskId = decodeURIComponent(priorityMatch[2]);
    if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    if (!['Low', 'Normal', 'High'].includes(input.priority)) return send(400, JSON.stringify({ error: 'Invalid priority' }));
    updatePriority.run(input.priority, taskId, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/rename$/);
  if (req.method === 'PATCH' && taskRenameMatch) {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const projectId = decodeURIComponent(taskRenameMatch[1]);
    const taskId = decodeURIComponent(taskRenameMatch[2]);
    if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
    renameTask.run(title, taskId, projectId);
    return send(200, JSON.stringify({ ok: true }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (req.method === 'GET' && !tasksMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    if (req.method === 'POST' && !tasksMatch[2]) {
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const task = { id: randomUUID(), projectId, title, completed: 0 };
      insertTask.run(task.id, projectId, title, Date.now());
      return send(201, JSON.stringify(task));
    }
    if (req.method === 'PATCH' && tasksMatch[2]) {
      const taskId = decodeURIComponent(tasksMatch[2]);
      if (!getTask.get(taskId, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      updateTask.run(input.completed ? 1 : 0, taskId, projectId);
      return send(200, JSON.stringify({ ok: true }));
    }
    return send(404, JSON.stringify({ error: 'Not found' }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(200, app, 'text/html; charset=utf-8');
  send(404, JSON.stringify({ error: 'Not found' }));
}
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
