import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, listProjects.all());
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let project;
    try { project = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const name = typeof project.name === 'string' ? project.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && match) {
    const project = getProject.get(Number(match[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch { res.writeHead(500); return res.end('Application unavailable'); }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
