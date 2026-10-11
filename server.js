import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
await mkdir(databasePath.includes('/') ? databasePath.slice(0, databasePath.lastIndexOf('/')) : '.', { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === '/' || pathname.startsWith('/projects/')
    ? 'index.html'
    : normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = join(publicDirectory, requestedPath);
  if (!filePath.startsWith(`${publicDirectory}/`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    sendJson(response, 200, projects);
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    try {
      const { name } = await readJson(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name: trimmedName });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET') {
    await serveStatic(decodeURIComponent(url.pathname), response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
