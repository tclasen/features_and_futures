import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const html = await readFile(path.join(root, 'index.html'));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/health' && req.method === 'GET') {
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
    }
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      return send(200, 'application/json; charset=utf-8', JSON.stringify(listProjects.all()));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch && req.method === 'GET') {
      const project = getProject.get(Number(projectMatch[1]));
      if (!project) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
      return send(200, 'application/json; charset=utf-8', JSON.stringify(project));
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
      const result = addProject.run(name);
      return send(201, 'application/json; charset=utf-8', JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
      return send(200, 'text/html; charset=utf-8', html);
    }
    send(404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    console.error(error);
    send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'Internal server error' }));
  }
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
