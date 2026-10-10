import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

export function createApplication(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  )`);
  const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

  function json(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  }

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (pathname === '/api/projects' && request.method === 'GET') {
        return json(response, 200, listProjects.all());
      }
      if (pathname === '/api/projects' && request.method === 'POST') {
        const chunks = [];
        let bodySize = 0;
        for await (const chunk of request) {
          bodySize += chunk.length;
          if (bodySize > 65536) {
            return json(response, 413, { error: 'Request is too large' });
          }
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return json(response, 400, { error: 'Invalid JSON' });
        }
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        const result = insertProject.run(name);
        return json(response, 201, getProject.get(Number(result.lastInsertRowid)));
      }
      const projectMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
      if (request.method === 'GET' && projectMatch) {
        const project = getProject.get(Number(projectMatch[1]));
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'GET') {
        const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(pathname) ? '/' : pathname);
        if (asset) {
          response.writeHead(200, { 'Content-Type': asset[0] });
          return response.end(asset[1]);
        }
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Unable to complete the request' });
      else response.end();
    }
  });
  server.on('close', () => database.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApplication(process.env.DB_PATH || './data/workboard.sqlite');
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
    console.log(`Workboard listening on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
