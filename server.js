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
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, 'application/json; charset=utf-8', JSON.stringify(listProjects.all()));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || '{}');
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, 'application/json; charset=utf-8', JSON.stringify(findProject.get(result.lastInsertRowid)));
    } catch {
      return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      return send(200, 'text/html; charset=utf-8', await readFile(path.join(root, 'index.html')));
    } catch {
      return send(500, 'text/plain; charset=utf-8', 'Unable to load application');
    }
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(200, 'text/javascript; charset=utf-8', await readFile(path.join(root, 'app.js')));
  }
  if (req.method === 'GET' && url.pathname === '/style.css') {
    return send(200, 'text/css; charset=utf-8', await readFile(path.join(root, 'style.css')));
  }
  send(404, 'text/plain; charset=utf-8', 'Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
