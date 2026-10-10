import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(process.env.DB_PATH || path.join(here, 'workboard.sqlite'));
await mkdir(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const page = await readFile(path.join(here, 'index.html'));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(listProjects.all()));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(findProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && /^\/api\/projects\/\d+$/.test(url.pathname)) {
    const project = findProject.get(Number(url.pathname.split('/').at(-1)));
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
process.on('SIGINT', () => { server.close(); db.close(); });
process.on('SIGTERM', () => { server.close(); db.close(); });
