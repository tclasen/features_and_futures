import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(400, { error: 'Invalid request' }); }
  }
  if (url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
  if (req.method !== 'GET' || (url.pathname !== '/' && !/^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await (await import('node:fs/promises')).readFile(join(root, 'index.html')));
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
