import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const publicFiles = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  try {
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && pathname === '/api/projects') {
      return json(response, 200, listProjects.all());
    }
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return json(response, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (request.method === 'POST' && pathname === '/api/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          return json(response, 413, { error: 'Request is too large' });
        }
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return json(response, 400, { error: 'Invalid JSON' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(response, 201, getProject.get(Number(result.lastInsertRowid)));
    }
    if (request.method === 'GET' && publicFiles.has(pathname)) {
      const [type, content] = publicFiles.get(pathname);
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    }
    if (request.method === 'GET' && (pathname === '/' || /^\/projects\/\d+$/.test(pathname))) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: 'Unable to process request' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
