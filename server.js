import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch { return send(400, { error: 'Invalid JSON' }); }
      if (typeof data.name !== 'string' || !data.name.trim()) return send(400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects(name) VALUES (?)').run(data.name.trim());
      return send(201, { id: Number(result.lastInsertRowid), name: data.name.trim() });
    });
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(200, project) : send(404, { error: 'Project not found' });
  }
  if (req.method === 'GET') {
    const file = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname) ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..') || file.includes('\\')) return send(404, 'Not found', 'text/plain');
    try {
      const content = awaitRead(join(root, 'public', file));
      return send(200, content, mime[extname(file)] || 'application/octet-stream');
    } catch { return send(404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  send(404, { error: 'Not found' });
});
function awaitRead(path) {
  // Static assets are small; synchronous reads keep the built-in server dependency-free.
  return readFileSync(path);
}
import { readFileSync } from 'node:fs';
server.listen(port, '0.0.0.0');
