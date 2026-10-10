import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const indexHtml = await readFile(path.join(directory, 'public', 'index.html'));
const clientJs = await readFile(path.join(directory, 'public', 'app.js'));
const stylesCss = await readFile(path.join(directory, 'public', 'styles.css'));

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const input = await readJson(request);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(clientJs);
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return response.end(stylesCss);
  }
  const pageMatch = url.pathname.match(/^\/projects\/(\d+)$/);
  if (request.method === 'GET' && pageMatch) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(indexHtml);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
