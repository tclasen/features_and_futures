import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return send(res, 200, JSON.stringify(listProjects.all()));
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const input = await bodyJson(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(match[1]));
      return project
        ? send(res, 200, JSON.stringify(project))
        : send(res, 404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/')) {
      return send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      const html = await readFile(path.join(root, 'public', 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    return send(res, 404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    const status = error.message === 'Request body too large' ? 413 : 400;
    return send(res, status, JSON.stringify({ error: status === 413 ? error.message : 'Invalid request' }));
  }
});

server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
