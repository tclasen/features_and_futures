import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || join(root, 'workboard.sqlite'));
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)');

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const id = randomUUID();
      db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());
      return json(res, 201, { id, name });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = resolve(root, 'public', relative);
    if (!path.startsWith(resolve(root, 'public') + '/') && path !== resolve(root, 'public')) return text(res, 404, 'Not found');
    try {
      const content = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
      return res.end(content);
    } catch { return text(res, 404, 'Not found'); }
  }
  text(res, 404, 'Not found');
});
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
function text(res, status, value) { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(value); }
async function readBody(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
