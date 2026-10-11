import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const indexHtml = await readFile(new URL('./public/index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' });
    res.end(body);
  };

  if (url.pathname === '/health' && req.method === 'GET') {
    return send(200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectMatch[1]);
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (url.pathname === '/' || url.pathname.startsWith('/projects/')) {
    return send(200, indexHtml, 'text/html; charset=utf-8');
  }
  return send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0');
