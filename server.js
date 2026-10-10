import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all();
    return json(response, 200, projects);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(response, 400, { error: 'Invalid request' }); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return json(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, name, Date.now());
    return json(response, 201, project);
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    const html = await readFile(path.join(directory, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(html);
  }
  response.writeHead(404);
  response.end('Not found');
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: 'Internal server error' });
    else response.end();
  });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
