import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
    return send(res, 200, JSON.stringify(projects));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    return send(res, 200, JSON.stringify(project));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
