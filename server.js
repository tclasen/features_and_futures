import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const page = await readFile(new URL('./index.html', import.meta.url));

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
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
    try {
      const { name } = await readBody(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return sendJson(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, project);
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
