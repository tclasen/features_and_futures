import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, listProjects.all());
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    sendJson(response, 201, project);
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method !== 'GET') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const filePath = url.pathname === '/' || url.pathname.startsWith('/projects/')
    ? join(publicDirectory, 'index.html')
    : join(publicDirectory, url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(filePath);
    const type = extname(filePath) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
