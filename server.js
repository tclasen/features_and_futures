// server.js
import http from 'node:http';
import { URL } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'workboard.db');

let db;

function initDb() {
  db = new sqlite.DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n  );`);
}

function jsonResponse(res, obj, status = 200) {
  const data = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath)
    .then(data => {
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('Not found');
    });
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Health endpoint
  if (req.method === 'GET' && pathname === '/health') {
    jsonResponse(res, { status: 'ok' });
    return;
  }

  // Serve static assets under /static/
  if (pathname.startsWith('/static/')) {
    const filePath = path.join(__dirname, pathname);
    serveStaticFile(res, filePath);
    return;
  }

  // API routes
  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      const rows = db.all('SELECT id, name FROM projects ORDER BY id');
      jsonResponse(res, rows);
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const name = (data.name || '').trim();
          if (!name) {
            jsonResponse(res, { error: 'Project name is required' }, 400);
            return;
          }
          const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
          const result = stmt.run(name);
          const newId = result.lastID;
          jsonResponse(res, { id: newId, name }, 201);
        } catch (e) {
          jsonResponse(res, { error: 'Invalid request' }, 400);
        }
      });
    } else {
      res.writeHead(405);
      res.end();
    }
    return;
  }

  // Project detail page
  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const id = projectMatch[1];
    const row = db.get('SELECT id, name FROM projects WHERE id = ?', id);
    if (!row) {
      res.writeHead(404);
      res.end('Project not found');
      return;
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${row.name}</title>
</head>
<body>
<h1>${row.name}</h1>
<button onclick="location.href='/'">Projects</button>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Root page
  if (pathname === '/' && req.method === 'GET') {
    const indexPath = path.join(__dirname, 'static', 'index.html');
    serveStaticFile(res, indexPath);
    return;
  }

  // Fallback
  res.writeHead(404);
  res.end('Not found');
}

function start() {
  initDb();
  const server = http.createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
