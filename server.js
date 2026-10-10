import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const app = await readFile(new URL('./index.html', import.meta.url));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let data = '';
    for await (const chunk of req) data += chunk;
    let input;
    try { input = JSON.parse(data); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return send(201, JSON.stringify(project));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(200, app, 'text/html; charset=utf-8');
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
