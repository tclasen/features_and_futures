import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'workboard.db');

// Initialize DB
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', err => reject(err));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Health endpoint
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // API routes
  if (pathname === '/api/projects' && req.method === 'GET') {
    const rows = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows));
    return;
  }

  if (pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim();
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
      const info = stmt.run(name);
      const newProject = { id: info.lastInsertRowid, name };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newProject));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  if (pathname.startsWith('/api/projects/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
    if (!row) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(row));
    }
    return;
  }

  // Serve static assets from public directory
  // For any GET request, try to serve file, fallback to index.html for SPA routes
  if (req.method === 'GET') {
    let filePath = path.join(__dirname, 'public', pathname);
    try {
      const stat = await (await import('node:fs')).promises.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const data = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    } catch (_) {
      // fallback to index.html for client-side routing
      try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        const data = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
    return;
  }

  // Method not allowed
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
