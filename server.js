import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(process.env.DB_PATH || join(root, 'data', 'workboard.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const readBody = (request) => new Promise((resolveBody, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try { resolveBody(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
  });
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    sendJson(response, 200, projects);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET') {
    const file = url.pathname === '/' || url.pathname.startsWith('/projects/')
      ? 'index.html'
      : url.pathname.slice(1);
    if (file === 'index.html' || file === 'app.js' || file === 'styles.css') {
      const { readFile } = await import('node:fs/promises');
      try {
        const content = await readFile(join(root, 'public', file));
        const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8' };
        response.writeHead(200, { 'content-type': types[file] });
        response.end(content);
      } catch {
        response.writeHead(404).end('Not found');
      }
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
