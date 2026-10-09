import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return send(response, 200, JSON.stringify(listProjects.all()));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 16_384) return send(response, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const payload = JSON.parse(raw);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = insertProject.run(name);
      return send(response, 201, JSON.stringify(findProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      return send(response, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(response, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
