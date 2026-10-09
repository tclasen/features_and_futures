import http from 'node:http';
import url from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
// Use the built‑in experimental synchronous SQLite API.

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

let db;
async function initDb() {
  // Synchronous database; operations are fast for this small app.
  db = new DatabaseSync(DB_PATH);
  // Ensure the table exists.
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`);
}

await initDb();

// Simple JSON body parser
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function handleApi(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const parts = parsedUrl.pathname.split('/').filter(Boolean); // e.g., ['api','projects',...]
  if (parts[0] !== 'api' || parts[1] !== 'projects') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // GET /api/projects – list
  if (req.method === 'GET' && parts.length === 2) {
    const rows = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows));
    return;
  }

  // POST /api/projects – create
  if (req.method === 'POST' && parts.length === 2) {
    try {
      const { name } = await parseJsonBody(req);
      const trimmed = (name || '').trim();
      if (!trimmed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project name is required' }));
        return;
      }
    const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
    const result = stmt.run(trimmed);
    const newId = result.lastInsertRowid;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: newId, name: trimmed }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }

  // GET /api/projects/:id – single
  if (req.method === 'GET' && parts.length === 3) {
    const id = Number(parts[2]);
      const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
    if (!row) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(row));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

async function serveStatic(req, res) {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  if (pathname === '/' || pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  const filePath = path.join(__dirname, 'public', pathname);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (parsed.pathname.startsWith('/api/')) {
    await handleApi(req, res);
    return;
  }
  // Serve project detail page for any /projects/<id>
  if (parsed.pathname.startsWith('/projects/')) {
    // Serve a generic project page that will fetch data client‑side
    const filePath = path.join(__dirname, 'public', 'project.html');
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }
  await serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

