import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const publicDir = join(import.meta.dirname, 'public');
const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });

  if (url.pathname === '/api/projects') {
    if (req.method === 'GET') {
      return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all());
    }
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed;
      try { parsed = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }

  if (req.method === 'GET') {
    const file = url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname) ? 'index.html' : null;
    if (file) {
      try {
        const content = await readFile(join(publicDir, file));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(content);
      } catch { return sendJson(res, 500, { error: 'Unable to load application' }); }
    }
  }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));
