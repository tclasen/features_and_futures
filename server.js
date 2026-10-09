import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, listProjects.all());
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(201, getProject.get(Number(result.lastInsertRowid)));
    } catch {
      return send(400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(200, project) : send(404, { error: 'Project not found' });
  }
  if (req.method === 'GET') {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (['index.html', 'app.js', 'styles.css'].includes(file)) {
      const ext = file.slice(file.lastIndexOf('.'));
      try { return send(200, readFileSync(join(root, 'public', file), 'utf8'), mime[ext]); }
      catch { return send(404, 'Not found', 'text/plain; charset=utf-8'); }
    }
  }
  send(404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
