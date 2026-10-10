import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const indexHtml = await readFile(new URL('./index.html', import.meta.url));

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

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
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
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

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

process.on('SIGINT', () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
});
process.on('SIGTERM', () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
});
