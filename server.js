import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)`);
// Upgrade databases created by earlier checkpoints.
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
  COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id=p.id
  WHERE p.archived=? GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived=? WHERE id=?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const readBody = async () => { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw); };
  if (url.pathname === '/health' && req.method === 'GET') return send(200, JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, JSON.stringify(listProjects.all(url.searchParams.get('filter') === 'archived' ? 1 : 0)));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const name = String((await readBody()).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = addProject.run(name);
      return send(201, JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveRoute && req.method === 'POST') {
    const project = getProject.get(Number(archiveRoute[1]));
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    setArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, project.id);
    return send(200, JSON.stringify(getProject.get(project.id)));
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const project = getProject.get(projectId);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (!taskRoute[2] && req.method === 'GET') return send(200, JSON.stringify(listTasks.all(projectId)));
    try {
      const body = await readBody();
      if (!taskRoute[2] && req.method === 'POST') {
        if (project.archived) return send(409, JSON.stringify({ error: 'Archived project' }));
        const title = String(body.title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        const result = addTask.run(projectId, title);
        return send(201, JSON.stringify(getTask.get(Number(result.lastInsertRowid), projectId)));
      }
      if (taskRoute[2] && req.method === 'PATCH') {
        if (project.archived) return send(409, JSON.stringify({ error: 'Archived project' }));
        updateTask.run(body.completed ? 1 : 0, Number(taskRoute[2]), projectId);
        const task = getTask.get(Number(taskRoute[2]), projectId);
        return task ? send(200, JSON.stringify(task)) : send(404, JSON.stringify({ error: 'Not found' }));
      }
      return send(405, JSON.stringify({ error: 'Method not allowed' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
    const project = getProject.get(Number(url.pathname.split('/').at(-1)));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    try { return send(200, await readFile(path.join(root, 'public', 'index.html')), 'text/html; charset=utf-8'); }
    catch { return send(500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && ['/app.js', '/style.css'].includes(url.pathname)) {
    try {
      const file = url.pathname.slice(1);
      return send(200, await readFile(path.join(root, 'public', file)), file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
    } catch { return send(404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
