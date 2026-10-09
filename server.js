import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body is too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
    }
    if (path === '/api/projects' && request.method === 'POST') {
      let input;
      try {
        input = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(response, 201, { id: Number(result.lastInsertRowid), name });
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectMatch[1]);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    const asset = assets.get(path) || (/^\/projects\/\d+$/.test(path) ? assets.get('/') : undefined);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: 'Unable to complete request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
