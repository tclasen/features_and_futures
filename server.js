import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || resolve('data/workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && pathname === '/api/projects') return json(res, 200, listProjects.all());
    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return json(res, project ? 200 : 404, project || { error: 'Project not found' });
    }
    if (req.method === 'POST' && pathname === '/api/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return json(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    }
    if (req.method === 'GET') {
      const asset = assets.get(/^\/projects\/\d+$/.test(pathname) ? '/' : pathname);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset[0] });
        return res.end(asset[1]);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'An unexpected error occurred' });
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
