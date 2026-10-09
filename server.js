import http from 'node:http';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sqlite from 'node:sqlite';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'workboard.db');

/** Initialize SQLite database with a projects table. */
function initDb() {
  const db = new sqlite.DatabaseSync(DB_PATH);
  // Ensure the projects table exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
  `);
  return db;
}

/** Helper to send JSON response. */
function json(res, obj, status = 200) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Serve static assets from the public directory. */
async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const publicDir = path.resolve('public');
  let filePath;
  if (url.pathname === '/' || url.pathname === '/index.html') {
    filePath = path.join(publicDir, 'index.html');
    const content = await readFile(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return true;
  }
  // Serve the project view page for routes like /projects/123 (no file extension).
  if (url.pathname.match(/^\/projects\/\d+$/)) {
    filePath = path.join(publicDir, 'project.html');
    const content = await readFile(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return true;
  }
  if (url.pathname === '/client.js') {
    filePath = path.join(publicDir, 'client.js');
    const content = await readFile(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(content);
    return true;
  }
  return false;
}

/** Main HTTP request handler. */
async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, { status: 'ok' });
    return;
  }

  // Serve static assets first
  if (await serveStatic(req, res)) return;

  // API routes
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const stmt = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
    const rows = stmt.all();
    json(res, rows);
    return;
  }

  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        const trimmed = (name || '').trim();
        if (!trimmed) {
          json(res, { error: 'Project name is required' }, 400);
          return;
        }
        const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
        const result = stmt.run(trimmed);
        json(res, { id: result.lastID, name: trimmed }, 201);
      } catch (e) {
        json(res, { error: 'Invalid request' }, 400);
      }
    });
    return;
  }

  if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
    const parts = url.pathname.split('/');
    const id = Number(parts[3]);
    const stmt = db.prepare('SELECT id, name FROM projects WHERE id = ?');
    const row = stmt.get(id);
    if (!row) {
      json(res, { error: 'Not found' }, 404);
      return;
    }
    json(res, row);
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// Initialize DB and start server synchronously
const db = initDb();
const server = http.createServer(requestHandler);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

