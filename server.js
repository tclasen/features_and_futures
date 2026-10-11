import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const getProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');

const page = await readFile(new URL('./public/index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && url.pathname === '/health') return json(200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(200, getProjects.all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = String(JSON.parse(body).name ?? '').trim(); } catch { return json(400, { error: 'Invalid request' }); }
    if (!name) return json(400, { error: 'Project name is required' });
    const id = randomUUID();
    insertProject.run(id, name, Date.now());
    return json(201, { id, name });
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const project = getProject.get(decodeURIComponent(match[1]));
    return project ? json(200, project) : json(404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
