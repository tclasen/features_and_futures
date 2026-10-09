import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || join(__dirname, 'workboard.db');

let db;
async function initDb() {
  db = new sqlite.DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`);
}

await initDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Health endpoint
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      // Projects list
      if (url.pathname === '/api/projects' && req.method === 'GET') {
        const rowsStmt = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
        const rows = rowsStmt.all();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
      }
      // Create project
      if (url.pathname === '/api/projects' && req.method === 'POST') {
        const body = await new Promise((resolve) => {
          let data = '';
          req.on('data', (chunk) => (data += chunk));
          req.on('end', () => resolve(data));
        });
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end('Invalid JSON');
          return;
        }
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Project name is required');
          return;
        }
        const insertStmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
        insertStmt.run(name);
        const idRow = db.prepare('SELECT last_insert_rowid() as id').get();
        const newProject = { id: idRow.id, name };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newProject));
        return;
      }
      // Get single project
      const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
      if (projectMatch && req.method === 'GET') {
        const id = Number(projectMatch[1]);
        const getStmt = db.prepare('SELECT id, name FROM projects WHERE id = ?');
        const row = getStmt.get(id);
        if (!row) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(row));
        return;
      }
      // Unknown API
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Serve static files from public
    let pathname = url.pathname;
    // Project detail page – serve the same HTML regardless of ID
    if (pathname.startsWith('/projects/')) {
      pathname = '/project.html';
    } else if (pathname === '/') {
      pathname = '/index.html';
    }
    const filePath = resolve(__dirname, 'public', '.' + pathname);
    try {
      const data = await readFile(filePath);
      const ext = filePath.split('.').pop();
      const mime = {
        html: 'text/html',
        js: 'application/javascript',
        css: 'text/css',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

