import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY sequence');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return json(res, 200, { status: 'ok' });
    if (path === '/api/projects' && req.method === 'GET') return json(res, 200, listProjects.all());
    if (path === '/api/projects' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) return json(res, 413, { error: 'Request is too large' });
      }
      let input;
      try { input = JSON.parse(body); }
      catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      insertProject.run(project.id, project.name);
      return json(res, 201, project);
    }
    const projectRoute = path.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectRoute) {
      const project = getProject.get(projectRoute[1]);
      return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'GET') {
      const asset = assets.get(path) || (/^\/projects\/[^/]+$/.test(path) ? assets.get('/') : null);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0] });
        return res.end(asset[1]);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Unable to process request' });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
