import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (url.pathname === '/health' && request.method === 'GET') return sendJson(response, 200, { status: 'ok' });
    if (url.pathname === '/api/projects' && request.method === 'GET') {
      return sendJson(response, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
    }
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });

    const relativePath = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname)
      ? 'index.html'
      : url.pathname.replace(/^\//, '');
    const filePath = join(root, 'public', relativePath);
    if (!filePath.startsWith(join(root, 'public'))) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(response, 400, { error: 'Invalid JSON' });
    if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found' });
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
