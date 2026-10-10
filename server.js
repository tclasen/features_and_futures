import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);

const page = await readFile(join(root, 'public', 'index.html'));
const script = await readFile(join(root, 'public', 'app.js'));
const style = await readFile(join(root, 'public', 'style.css'));

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(value);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const input = await readJson(req);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectRoute) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectRoute[1]));
    return project
      ? send(res, 200, JSON.stringify(project))
      : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(res, 200, script, 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/style.css') {
    return send(res, 200, style, 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
