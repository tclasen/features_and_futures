import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (url.pathname === '/health' && req.method === 'GET') return send(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, 'application/json; charset=utf-8', JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, 'application/json; charset=utf-8', JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const project = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (project && req.method === 'GET') {
    const item = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(project[1]));
    return item ? send(200, 'application/json; charset=utf-8', JSON.stringify(item)) : send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    const { readFile } = await import('node:fs/promises');
    return send(200, 'text/html; charset=utf-8', await readFile(indexPath));
  }
  send(404, 'text/plain; charset=utf-8', 'Not found');
});
server.listen(port, '0.0.0.0');
