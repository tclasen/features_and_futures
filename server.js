import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);

const html = await readFile(new URL('./index.html', import.meta.url));
const send = (res, status, data, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  const match = url.pathname.match(/^\/projects\/(\d+)$/);
  if (req.method === 'GET' && match) return send(res, 200, html, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
