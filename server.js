import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const getProjects = db.prepare(`SELECT p.id, p.name, p.archived, SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completed, COUNT(t.id) AS total FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const getTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const page = await readFile(new URL('./public/index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && url.pathname === '/health') return json(200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(200, getProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const id = decodeURIComponent(archiveMatch[1]);
    if (!getProject.get(id)) return json(404, { error: 'Not found' });
    setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
    return json(200, { status: 'ok' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = String(JSON.parse(body).name ?? '').trim(); } catch { return json(400, { error: 'Invalid request' }); }
    if (!name) return json(400, { error: 'Project name is required' });
    const id = randomUUID();
    insertProject.run(id, name, Date.now());
    return json(201, { id, name });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameMatch) {
    const id = decodeURIComponent(renameMatch[1]);
    const project = getProject.get(id);
    if (!project) return json(404, { error: 'Not found' });
    if (project.archived) return json(403, { error: 'Archived project' });
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const name = String(body.name ?? '').trim();
    if (!name) return json(400, { error: 'Project name is required' });
    renameProject.run(name, id);
    return json(200, { id, name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(404, { error: 'Not found' });
    if (req.method === 'GET') return json(200, getTasks.all(projectId));
    if (req.method === 'POST') {
      if (getProject.get(projectId).archived) return json(403, { error: 'Archived project' });
      let body;
      try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
      const title = String(body.title ?? '').trim();
      if (!title) return json(400, { error: 'Task title is required' });
      const id = randomUUID();
      insertTask.run(id, projectId, title, Date.now());
      return json(201, { id, title, completed: 0 });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body;
    try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request' }); }
    const project = getProject.get(decodeURIComponent(taskMatch[1]));
    if (!project || project.archived) return json(403, { error: 'Archived project' });
    const result = updateTask.run(body.completed ? 1 : 0, decodeURIComponent(taskMatch[2]), decodeURIComponent(taskMatch[1]));
    return result.changes ? json(200, { status: 'ok' }) : json(404, { error: 'Not found' });
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const project = getProject.get(decodeURIComponent(match[1]));
    return project ? json(200, project) : json(404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
