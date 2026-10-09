import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'workboard.db');

// Initialize DB and ensure table exists
// Synchronous SQLite database using the experimental built‑in API.
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function jsonResponse(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  let pathname = urlObj.pathname;
  // SPA root
  if (pathname === '/') pathname = '/index.html';
  // Project detail page
  if (/^\/projects\/\d+$/.test(pathname)) pathname = '/project.html';
  const filePath = path.join(__dirname, 'public', pathname);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

async function handler(req, res) {
  const { method } = req;
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname === '/health' && method === 'GET') {
    return jsonResponse(res, 200, { status: 'ok' });
  }

  if (pathname.startsWith('/api/')) {
    // db is already available synchronously

    // List projects
    if (pathname === '/api/projects' && method === 'GET') {
      const rows = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
      return jsonResponse(res, 200, rows);
    }

    // Create project
    if (pathname === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      let payload;
      try { payload = JSON.parse(body); } catch { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }
      const name = (payload.name || '').trim();
      if (!name) {
        return jsonResponse(res, 400, { error: 'Project name is required' });
      }
      const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
      const info = stmt.run(name);
      const newProject = { id: info.lastInsertRowid, name };
      return jsonResponse(res, 201, newProject);
    }

    // Get single project
    const match = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (match && method === 'GET') {
      const id = Number(match[1]);
      const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
      if (!row) return jsonResponse(res, 404, { error: 'Not found' });
      return jsonResponse(res, 200, row);
    }

    return jsonResponse(res, 404, { error: 'Not found' });
  }

  // Static assets
  return serveStatic(req, res);
}

const server = http.createServer(handler);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

