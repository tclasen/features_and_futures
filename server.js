import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const html = await readFile(path.join(root, 'index.html'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, JSON.stringify(listProjects.all()));
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, JSON.stringify(getProject.get(result.lastInsertRowid)));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
