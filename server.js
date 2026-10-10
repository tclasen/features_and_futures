import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount
  FROM projects p ORDER BY p.id`);

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(listTasks.all(Number(taskRoute[1]))));
    return;
  }
  if (taskRoute && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const title = String(JSON.parse(body).title ?? '').trim();
      if (!title) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Task title is required' })); return; }
      const projectId = Number(taskRoute[1]);
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId)?.archived) { res.writeHead(403); res.end(); return; }
      const result = createTask.run(projectId, title, projectId);
      if (!Number(result.changes)) { res.writeHead(404); res.end(); return; }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: 0 }));
    } catch { res.writeHead(400); res.end(); }
    return;
  }
  const completionRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (completionRoute && req.method === 'PATCH') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const completed = JSON.parse(body).completed ? 1 : 0;
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)').run(completed, Number(completionRoute[2]), Number(completionRoute[1]), Number(completionRoute[1]));
      res.writeHead(result.changes ? 204 : 404); res.end();
    } catch { res.writeHead(400); res.end(); }
    return;
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveRoute && req.method === 'PATCH') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived ? 1 : 0;
      const result = setArchived.run(archived, Number(archiveRoute[1]));
      res.writeHead(result.changes ? 204 : 404); res.end();
    } catch { res.writeHead(400); res.end(); }
    return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(listProjects.all()));
    return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const result = createProject.run(name);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500); res.end('Unable to load application');
    }
    return;
  }
  if (req.method === 'GET' && ['/app.js', '/style.css'].includes(url.pathname)) {
    const file = path.join(root, url.pathname.slice(1));
    try {
      res.writeHead(200, { 'content-type': mime[path.extname(file)] });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
