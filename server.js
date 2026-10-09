import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const name = String((await readBody(request)).name ?? '').trim();
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      addProject.run(project.id, project.name, Date.now());
      return sendJson(response, 201, project);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(await readFile(path.join(here, 'index.html')));
  }
  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(await readFile(path.join(here, 'index.html')));
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
