import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const publicDirectory = join(import.meta.dirname, 'public');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET') {
    const requested = url.pathname === '/' || url.pathname.startsWith('/projects/') ? 'index.html' : url.pathname.slice(1);
    if (requested.includes('..') || requested.includes('/')) { response.writeHead(404).end(); return; }
    try {
      const content = await readFile(join(publicDirectory, requested));
      response.writeHead(200, { 'content-type': mimeTypes[extname(requested)] || 'application/octet-stream' });
      response.end(content);
    } catch { response.writeHead(404).end('Not found'); }
    return;
  }
  response.writeHead(405).end();
});

server.listen(port, '0.0.0.0');
