import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function serveAsset(response, file, type) {
  try {
    response.writeHead(200, { 'content-type': type });
    response.end(readFileSync(join(root, 'public', file)));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
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
    let body;
    try {
      body = await new Promise((resolve, reject) => {
        let raw = '';
        request.setEncoding('utf8');
        request.on('data', chunk => { raw += chunk; if (raw.length > 100_000) reject(new Error('Request too large')); });
        request.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
        });
        request.on('error', reject);
      });
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return sendJson(response, 201, project);
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const project = getProject.get(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/projects/')) {
    return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/') return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/app.js') return serveAsset(response, 'app.js', 'text/javascript; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/styles.css') return serveAsset(response, 'styles.css', 'text/css; charset=utf-8');
  response.writeHead(404);
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
