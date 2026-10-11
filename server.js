import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function serveFile(response, filename, contentType) {
  try {
    const content = await readFile(path.join(root, filename));
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return json(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
  }

  if (request.method === 'GET' && url.pathname === '/') {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return serveFile(response, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    return serveFile(response, 'styles.css', 'text/css; charset=utf-8');
  }
  if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }

  response.writeHead(404);
  response.end('Not found');
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
