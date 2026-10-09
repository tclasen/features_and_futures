import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(root, 'public');
const databasePath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all();
    sendJson(response, 200, projects);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let input;
    try {
      input = await readJson(request);
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
      return;
    }
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const project = { id: randomUUID(), name };
    database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
    sendJson(response, 201, project);
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(decodeURIComponent(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET') {
    const isProjectPage = /^\/projects\/[^/]+\/?$/.test(url.pathname);
    const requestedPath = url.pathname === '/' || isProjectPage ? '/index.html' : url.pathname;
    const filePath = resolve(publicDirectory, `.${requestedPath}`);
    if (filePath.startsWith(`${publicDirectory}/`) || filePath === join(publicDirectory, 'index.html')) {
      try {
        const content = readFileSync(filePath);
        response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
        response.end(content);
        return;
      } catch {
        // Fall through to the not-found response.
      }
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
