import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(response, 200, projects);
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }

  const requestedPath = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
    ? 'index.html'
    : url.pathname.replace(/^\//, '');
  const filePath = resolve(root, 'public', requestedPath);
  if (!filePath.startsWith(resolve(root, 'public') + '/') && filePath !== resolve(root, 'public', 'index.html')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
