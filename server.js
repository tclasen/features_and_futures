import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = process.env.DB_PATH ?? join(here, 'data', 'workboard.sqlite');
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = insertProject.run(name);
      sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch (error) {
      sendJson(response, 400, { error: error.message === 'Request body too large' ? error.message : 'Invalid request body' });
    }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(here, 'public', 'index.html')));
    return;
  }
  const projectMatch = url.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (request.method === 'GET' && projectMatch) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(here, 'public', 'project.html')));
    return;
  }
  const apiProjectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && apiProjectMatch) {
    const project = getProject.get(Number(apiProjectMatch[1]));
    sendJson(response, project ? 200 : 404, project ?? { error: 'Project not found' });
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/public/')) {
    const filePath = url.pathname.slice('/public/'.length);
    if (!['app.js', 'project.js', 'styles.css'].includes(filePath)) {
      response.writeHead(404).end();
      return;
    }
    const type = filePath.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    response.writeHead(200, { 'Content-Type': type });
    response.end(await readFile(join(here, 'public', filePath)));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
