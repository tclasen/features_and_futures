import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return send(response, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return send(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return send(response, 201, project);
  }
  const detail = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && detail) {
    const project = findProject.get(decodeURIComponent(detail[1]));
    return project ? send(response, 200, project) : send(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    try { return send(response, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(response, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  send(response, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
