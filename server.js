import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const indexHtml = await readFile(join(root, 'index.html'));
const styles = await readFile(join(root, 'styles.css'));
const client = await readFile(join(root, 'client.js'));

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const payload = JSON.parse(body);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: 'Invalid JSON' });
        return;
      }
      throw error;
    }
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = Number.isInteger(id) && id > 0
      ? database.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
      : undefined;
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    response.end(styles);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/client.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(client);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
