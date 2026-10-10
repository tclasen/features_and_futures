import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const sendJson = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  try {
    if (url.pathname === '/health' && req.method === 'GET') return sendJson(200, { status: 'ok' });
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      return sendJson(200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body); } catch { return sendJson(400, { error: 'Invalid request' }); }
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(201, { id: Number(result.lastInsertRowid), name });
    }
    const detail = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (detail && req.method === 'GET') {
      const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(detail[1]));
      return project ? sendJson(200, project) : sendJson(404, { error: 'Project not found' });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(404, { error: 'Not found' });
    const html = await readFile(path.join(root, 'public', 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    console.error(error);
    sendJson(500, { error: 'Internal server error' });
  }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
