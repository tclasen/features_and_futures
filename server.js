import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const indexHtml = await readFile(new URL('./public/index.html', import.meta.url));
const appJs = await readFile(new URL('./public/app.js', import.meta.url));

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, JSON.stringify({ status: 'ok' }));
    }
    if (url.pathname === '/api/projects' && request.method === 'GET') {
      const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
      return send(response, 200, JSON.stringify(projects));
    }
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const { name } = await readJson(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name: trimmedName }));
    }
    if (request.method === 'GET' && url.pathname === '/app.js') {
      return send(response, 200, appJs, 'text/javascript; charset=utf-8');
    }
    if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      return send(response, 200, indexHtml, 'text/html; charset=utf-8');
    }
    return send(response, 404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, JSON.stringify({ error: 'Invalid JSON' }));
    console.error(error);
    return send(response, 500, JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
