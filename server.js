import http from 'node:http';
import { URL } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sqlite from 'node:sqlite';

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'workboard.db');

let db;
function initDb() {
  // Use the experimental synchronous SQLite API bundled with Node.
  db = new sqlite.DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`);
}

function getJsonBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (_) { resolve({}); }
    });
  });
}

function handleApi(req, url) {
  const method = req.method;
  const pathname = url.pathname;
  if (pathname === '/api/projects') {
    if (method === 'GET') {
      const rows = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
      return { status: 200, json: rows };
    }
    if (method === 'POST') {
      // Body parsing is asynchronous, but we treat it as a promise.
      return getJsonBody(req).then(body => {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          return { status: 400, json: { error: 'Project name is required' } };
        }
        const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
        const id = result.lastInsertRowid;
        return { status: 201, json: { id, name } };
      });
    }
  }
  if (pathname.startsWith('/api/projects/')) {
    const id = parseInt(pathname.split('/')[3], 10);
    if (Number.isNaN(id)) {
      return { status: 400, json: { error: 'Invalid ID' } };
    }
    if (method === 'GET') {
      const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
      if (!row) return { status: 404, json: { error: 'Not found' } };
      return { status: 200, json: row };
    }
  }
  return { status: 404, json: { error: 'Not found' } };
}

async function serveStatic(filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    }[ext] || 'application/octet-stream';
    return { status: 200, headers: { 'Content-Type': mime }, body: data };
  } catch {
    return { status: 404, body: Buffer.from('Not found') };
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const result = await handleApi(req, url);
    // result may be a promise (for POST body parsing)
    const final = await Promise.resolve(result);
    res.writeHead(final.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(final.json));
    return;
  }
  // Serve static files; fallback to index.html for SPA routes.
  let filePath = path.join(process.cwd(), 'public', url.pathname);
  if (url.pathname === '/' || url.pathname.endsWith('/')) {
    filePath = path.join(process.cwd(), 'public', 'index.html');
  }
  const staticResult = await serveStatic(filePath);
  if (staticResult.status === 404) {
    const fallback = await serveStatic(path.join(process.cwd(), 'public', 'index.html'));
    res.writeHead(fallback.status, fallback.headers || { 'Content-Type': 'text/html' });
    res.end(fallback.body);
  } else {
    res.writeHead(staticResult.status, staticResult.headers || { 'Content-Type': 'text/plain' });
    res.end(staticResult.body);
  }
}

initDb();

const server = http.createServer(requestHandler);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

