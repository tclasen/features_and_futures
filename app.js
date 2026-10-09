import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16384) {
      throw new Error('Request body is too large');
    }
  }
  return JSON.parse(body);
}

export function createApp(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
  const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (path === '/api/projects' && request.method === 'GET') {
        return json(response, 200, listProjects.all());
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
        const result = insertProject.run(name);
        return json(response, 201, findProject.get(result.lastInsertRowid));
      }
      const match = path.match(/^\/api\/projects\/(\d+)$/);
      if (request.method === 'GET' && match) {
        const project = findProject.get(match[1]);
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'GET') {
        const asset = /^\/projects\/\d+$/.test(path) ? assets.get('/') : assets.get(path);
        if (asset) {
          response.writeHead(200, { 'Content-Type': asset[1] });
          return response.end(readFileSync(new URL(`./public/${asset[0]}`, import.meta.url)));
        }
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Internal server error' });
      else response.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}
