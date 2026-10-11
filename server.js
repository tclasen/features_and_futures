import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = resolve(process.env.DB_PATH ?? 'workboard.sqlite');
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const page = await readFile(new URL('./public/index.html', import.meta.url));
const styles = await readFile(new URL('./public/styles.css', import.meta.url));
const client = await readFile(new URL('./public/app.js', import.meta.url));

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType, 'x-content-type-options': 'nosniff' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify(projects));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      send(response, 201, 'application/json; charset=utf-8', JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    send(response, 200, 'text/css; charset=utf-8', styles);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    send(response, 200, 'text/javascript; charset=utf-8', client);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    send(response, 200, 'text/html; charset=utf-8', page);
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(port, '0.0.0.0');
