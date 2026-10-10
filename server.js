import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

const htmlPath = path.join(import.meta.dirname, 'index.html');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/health' && req.method === 'GET') {
    return send(200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return send(200, JSON.stringify(projects));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'Not found' }));
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try { return send(200, await readFile(htmlPath, 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
