import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
    return send(res, 200, JSON.stringify(projects));
  }

  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const input = await readJson(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = resolve(root, relative);
    if (file.startsWith(`${root}/`) || file === join(root, 'index.html')) {
      try {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(file);
        return send(res, 200, content, types[extname(file)] || 'application/octet-stream');
      } catch {
        // Unknown browser routes use the single page entry point.
      }
    }
    const { readFile } = await import('node:fs/promises');
    return send(res, 200, await readFile(join(root, 'index.html')), types['.html']);
  }

  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
