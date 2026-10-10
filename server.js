import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
`);
db.exec('PRAGMA foreign_keys = ON');
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const readBody = async () => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body); };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`).all().map(p => ({...p, archived: Boolean(p.archived)})));
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try { const name = String((await readBody()).name ?? '').trim(); if (!name) return send(400, { error: 'Project name is required' }); const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name); return send(201, { id: Number(result.lastInsertRowid), name }); }
    catch { return send(400, { error: 'Invalid request' }); }
  }
  const projectRename = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRename && req.method === 'PATCH') {
    try {
      const name = String((await readBody()).name ?? '').trim();
      if (!name) return send(400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(projectRename[1]));
      return result.changes ? send(200, { ok: true, name }) : send(404, { error: 'Project not found or archived' });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  const projectArchive = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (projectArchive && req.method === 'PATCH') {
    try { const { archived } = await readBody(); const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, Number(projectArchive[1])); return result.changes ? send(200, {ok:true}) : send(404, {error:'Project not found'}); }
    catch { return send(400, {error:'Invalid request'}); }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') return send(200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskRoute[1])).map(task => ({...task, completed: Boolean(task.completed)})));
  if (taskRoute && req.method === 'POST') {
    try {
      const projectId = Number(taskRoute[1]);
      const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(404, {error:'Project not found'});
      if (project.archived) return send(403, {error:'Archived project'});
      const title = String((await readBody()).title ?? '').trim();
      if (!title) return send(400, {error:'Task title is required'});
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(201, {id:Number(result.lastInsertRowid), title, completed:false});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  const taskUpdate = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      const body = await readBody();
      const projectId = Number(taskUpdate[1]), taskId = Number(taskUpdate[2]);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(404, {error:'Project not found'});
      if (project.archived) return send(403, {error:'Archived project'});
      if (Object.hasOwn(body, 'title')) {
        const title = String(body.title ?? '').trim();
        if (!title) return send(400, {error:'Task title is required'});
        const result = db.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?').run(title, projectId, taskId);
        return result.changes ? send(200, {ok:true, title}) : send(404, {error:'Task not found'});
      }
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?').run(body.completed ? 1 : 0, projectId, taskId);
      return result.changes ? send(200, {ok:true}) : send(404, {error:'Task not found'});
    } catch { return send(400, {error:'Invalid request'}); }
  }
  if (url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
  if (req.method !== 'GET' || (url.pathname !== '/' && !/^\/projects\/[^/]+\/?$/.test(url.pathname))) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await (await import('node:fs/promises')).readFile(join(root, 'index.html')));
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
