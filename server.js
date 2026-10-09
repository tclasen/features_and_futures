import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const publicDir = join(root, 'public');

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

function serveStatic(pathname, response) {
  const file = pathname === '/' || pathname.startsWith('/projects/')
    ? 'index.html'
    : pathname.slice(1);
  const target = resolve(publicDir, file);
  if (!target.startsWith(`${publicDir}/`) && target !== join(publicDir, 'index.html')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const contents = readFileSync(target);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = insertProject.run(name);
      sendJson(response, 201, findProject.get(Number(result.lastInsertRowid)));
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project || { error: 'Project not found' });
    return;
  }
  if (request.method === 'GET') {
    serveStatic(url.pathname, response);
    return;
  }
  response.writeHead(405).end();
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
