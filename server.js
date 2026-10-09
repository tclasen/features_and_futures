import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const allProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const html = await readFile(join(root, 'public', 'index.html'));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(allProjects.all()));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
        if (!name) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Project name is required' }));
          return;
        }
        const result = createProject.run(name);
        res.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ id: Number(result.lastInsertRowid), name }));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
