import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const projectList = database.prepare('SELECT id, name FROM projects ORDER BY id');
const projectById = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects') {
    if (request.method === 'GET') {
      sendJson(response, 200, projectList.all());
      return;
    }
    if (request.method === 'POST') {
      try {
        const { name } = await readJson(request);
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
          sendJson(response, 400, { error: 'Project name is required' });
          return;
        }
        const result = insertProject.run(trimmedName);
        sendJson(response, 201, projectById.get(result.lastInsertRowid));
      } catch {
        sendJson(response, 400, { error: 'Invalid request body' });
      }
      return;
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = projectById.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project || { error: 'Project not found' });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(join(root, 'public', 'index.html'));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    } catch {
      sendJson(response, 500, { error: 'Application files unavailable' });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/')) {
    const asset = url.pathname.match(/^\/(app\.js|styles\.css)$/);
    if (asset) {
      try {
        const body = await readFile(join(root, 'public', asset[1]));
        response.writeHead(200, { 'content-type': asset[1].endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
        response.end(body);
      } catch {
        sendJson(response, 404, { error: 'Not found' });
      }
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
