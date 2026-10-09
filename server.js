import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import sqlite from 'node:sqlite';
import sqlite3 from 'node:sqlite3';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || 'workboard.db';

// Initialize SQLite database and ensure the projects table exists.
const dbPromise = (async () => {
  const db = await sqlite.open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);
  return db;
})();

/** Utility to collect request body as text */
async function getRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Health endpoint
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // API routes
    if (pathname === '/api/projects') {
      const db = await dbPromise;
      if (req.method === 'GET') {
        const rows = await db.all('SELECT id, name FROM projects ORDER BY id');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
      }
      if (req.method === 'POST') {
        const body = await getRequestBody(req);
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project name is required' }));
          return;
        }
        const result = await db.run('INSERT INTO projects (name) VALUES (?)', name);
        const newProject = { id: result.lastID, name };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newProject));
        return;
      }
    }

    // Get a single project
    if (pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const id = Number(pathname.split('/').pop());
      const db = await dbPromise;
      const row = await db.get('SELECT id, name FROM projects WHERE id = ?', id);
      if (!row) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(row));
      return;
    }

    // Serve static HTML files
    if (pathname === '/' || pathname === '/index.html') {
      const html = await readFile('public/index.html', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
    if (pathname.startsWith('/projects/') && /^\/projects\/\d+$/.test(pathname)) {
      const html = await readFile('public/project.html', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    console.error('Server error', e);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

