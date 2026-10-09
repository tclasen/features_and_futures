import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const html = await readFile(new URL('./public/index.html', import.meta.url));
const javascript = await readFile(new URL('./public/app.js', import.meta.url));

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return send(response, 200, javascript, 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return send(response, 200, JSON.stringify(projects));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const payload = await readJson(request);
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(response, 200, html, 'text/html; charset=utf-8');
  }
  return send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
