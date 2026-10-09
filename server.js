import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, 'public');

// Environment configuration
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

let db;

function initDb() {
  // Use the synchronous experimental API; it works without callbacks and fits the simple query needs.
  db = new DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`);
}

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Health endpoint
  if (pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // Static assets under /static/
  if (pathname.startsWith('/static/') && req.method === 'GET') {
    const relativePath = pathname.slice(1); // remove leading '/'
    const filePath = path.join(PUBLIC_DIR, relativePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    sendFile(res, filePath, mime);
    return;
  }

  // API routes
  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
      sendJson(res, 200, rows);
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', async () => {
        try {
          const { name } = JSON.parse(body);
          const trimmed = (name || '').trim();
          if (!trimmed) {
            sendJson(res, 400, { error: 'Project name is required' });
            return;
          }
          const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
          const info = stmt.run(trimmed);
          const newProject = { id: info.lastInsertRowid, name: trimmed };
          sendJson(res, 201, newProject);
        } catch (e) {
          sendJson(res, 400, { error: 'Invalid request' });
        }
      });
      return;
    }
  }

  // Project page route
  const projectPageMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectPageMatch && req.method === 'GET') {
    const projectId = Number(projectPageMatch[1]);
    const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId);
    if (!row) {
      res.writeHead(404);
      res.end('Project not found');
      return;
    }
    // Serve a simple HTML page rendered server‑side
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Project – ${row.name}</title>
  <link rel="stylesheet" href="/static/style.css" />
</head>
  <body>
    <h1>${row.name}</h1>
    <button id="backBtn">Projects</button>
    <script>
      document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/';
      });
    </script>
  </body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Root page – serve index.html
  if (pathname === '/' && req.method === 'GET') {
    const filePath = path.join(PUBLIC_DIR, 'index.html');
    sendFile(res, filePath, 'text/html');
    return;
  }

  // Fallback 404
  res.writeHead(404);
  res.end('Not found');
}

initDb();

const server = http.createServer((req, res) => {
  // Catch async errors
  handleRequest(req, res).catch(err => {
    console.error('Error handling request', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

