import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = process.env.DB_PATH ?? join(root, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
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

async function serveFile(response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(publicDir, requestedPath));
  if (!filePath.startsWith(`${publicDir}/`)) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const content = await readFile(filePath);
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
    };
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    // Project URLs are client-rendered, so serve the app shell on direct navigation.
    if (pathname.startsWith('/projects/')) {
      try {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(await readFile(join(publicDir, 'index.html')));
        return;
      } catch {
        // Fall through to the standard not found response.
      }
    }
    response.writeHead(404).end('Not found');
  }
}

const server = createServer(async (request, response) => {
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
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = createProject.run(name);
    sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET') {
    await serveFile(response, url.pathname);
    return;
  }
  response.writeHead(405).end('Method not allowed');
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
