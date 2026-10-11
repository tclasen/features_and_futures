import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const assets = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./app.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./styles.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./index.html', import.meta.url));

function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(response, 200, projects);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try {
      name = JSON.parse(body).name;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request body' });
    }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (request.method === 'GET' && assets.has(url.pathname)) {
    const [contentType, content] = assets.get(url.pathname);
    response.writeHead(200, { 'content-type': contentType });
    return response.end(content);
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});
