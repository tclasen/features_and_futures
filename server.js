import http from 'node:http';
import { URL } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sqlite from 'node:sqlite';
import { open } from 'node:sqlite';

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'workboard.db');

let db;
async function initDb() {
  db = await open({ filename: DB_PATH, driver: sqlite.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`);
}

async function handleApi(req, url) {
  const method = req.method;
  const pathname = url.pathname;
  if (pathname === '/api/projects') {
    if (method === 'GET') {
      const rows = await db.all('SELECT id, name FROM projects ORDER BY id');
      return { status: 200, json: rows };
    } else if (method === 'POST') {
      const body = await getJsonBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return { status: 400, json: { error: 'Project name is required' } };
      }
      const result = await db.run('INSERT INTO projects (name) VALUES (?)', name);
      const id = result.lastID;
      return { status: 201, json: { id, name } };
    }
  } else if (pathname.startsWith('/api/projects/')) {
    const id = parseInt(pathname.split('/')[3], 10);
    if (Number.isNaN(id)) {
      return { status: 400, json: { error: 'Invalid ID' } };
    }
    if (method === 'GET') {
      const row = await db.get('SELECT id, name FROM projects WHERE id = ?', id);
      if (!row) return { status: 404, json: { error: 'Not found' } };
      return { status: 200, json: row };
    }
  }
  return { status: 404, json: { error: 'Not found' } };
}

function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve({}); }
    });
    req.on('error', err => reject(err));
  });
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
  } catch (e) {
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
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.json));
    return;
  }
  // Serve static files from public
  let filePath = path.join(process.cwd(), 'public', url.pathname);
  // If root or directory, serve index.html
  if (url.pathname === '/' || url.pathname.endsWith('/')) {
    filePath = path.join(process.cwd(), 'public', 'index.html');
  }
  const staticResult = await serveStatic(filePath);
  res.writeHead(staticResult.status, staticResult.headers || { 'Content-Type': 'text/plain' });
  res.end(staticResult.body);
}

await initDb();

const server = http.createServer(requestHandler);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
