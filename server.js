import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(listProjects.all())); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project name is required' })); return; }
      const project = { id: randomUUID(), name };
      createProject.run(project.id, name, Date.now());
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(project));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid request' })); }
    return;
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const html = await readFile(path.join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch { res.writeHead(500); res.end('Application unavailable'); }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
