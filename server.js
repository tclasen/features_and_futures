import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const indexHtml = await readFile(new URL('./index.html', import.meta.url));
const projectHtml = await readFile(new URL('./project.html', import.meta.url));

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    json(response, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { json(response, 400, { error: 'Project name is required' }); return; }
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    json(response, 201, { id: Number(result.lastInsertRowid), name });
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) { json(response, 404, { error: 'Project not found' }); return; }
    json(response, 200, project);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }
  if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(projectHtml);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
