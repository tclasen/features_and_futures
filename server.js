import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(base, 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const html = await readFile(path.join(base, 'public', 'index.html'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      if (name.length > 500) return send(400, JSON.stringify({ error: 'Project name is too long' }));
      const id = randomUUID();
      insertProject.run(id, name, Date.now());
      return send(201, JSON.stringify({ id, name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const item = findProject.get(decodeURIComponent(match[1]));
    return item ? send(200, JSON.stringify(item)) : send(404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'Not found' }));
  return send(404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
