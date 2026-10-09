import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const assets = new Map([
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/projects') return json(res, 200, listProjects.all());
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'POST' && path === '/api/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) return json(res, 413, { error: 'Request is too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(res, 201, getProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET' && assets.has(path)) {
      const [type, body] = assets.get(path);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(body);
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Unable to complete request' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
