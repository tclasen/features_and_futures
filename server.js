import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);`);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/health' && req.method === 'GET') return send(200, JSON.stringify({ status: 'ok' }));
    const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch && req.method === 'GET' && !taskMatch[2]) {
      return send(200, JSON.stringify(db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskMatch[1]))));
    }
    if (taskMatch && req.method === 'POST' && !taskMatch[2]) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(taskMatch[1]))) return send(404, JSON.stringify({ error: 'Project not found' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(Number(taskMatch[1]), title);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId: Number(taskMatch[1]), title, completed: 0 }));
    }
    if (taskMatch && req.method === 'PATCH' && taskMatch[2]) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof data.completed !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(data.completed ? 1 : 0, Number(taskMatch[2]), Number(taskMatch[1]));
      return result.changes ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
    }
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      return send(200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
      return send(200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    return send(404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    send(500, JSON.stringify({ error: 'Internal server error' }));
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
