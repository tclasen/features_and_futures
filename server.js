import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(res, 200, projects);
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500);
      return res.end('Application unavailable');
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
