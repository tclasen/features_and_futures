import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const html = await readFile(new URL('./index.html', import.meta.url));
const sendJson = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(res, 200, projects);
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (url.pathname.startsWith('/api/projects/')) {
    const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
    if (taskRoute) {
      const projectId = Number(taskRoute[1]);
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      if (req.method === 'GET') {
        return sendJson(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        let title;
        try { title = JSON.parse(body).title; } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
        title = typeof title === 'string' ? title.trim() : '';
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        return sendJson(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
      }
    }
    const completionRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
    if (completionRoute && req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let completed;
      try { completed = JSON.parse(body).completed; } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
      if (typeof completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid request' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(completed), Number(completionRoute[2]), Number(completionRoute[1]));
      if (!result.changes) return sendJson(res, 404, { error: 'Task not found' });
      return sendJson(res, 200, { completed });
    }
    if (req.method !== 'GET') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = Number.isInteger(id) && id > 0
      ? db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
      : undefined;
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  if (req.method === 'GET' && /^\/projects\/[^/]+\/?$/.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
