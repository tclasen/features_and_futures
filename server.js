import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const page = readFileSync(new URL('./public/index.html', import.meta.url));
const script = readFileSync(new URL('./public/app.js', import.meta.url));
const styles = readFileSync(new URL('./public/style.css', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/projects') return send(res, 200, listProjects.all());
    const match = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'POST' && path === '/api/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) return send(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); }
      catch { return send(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(res, 201, findProject.get(result.lastInsertRowid));
    }
    if (req.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      return send(res, 200, page, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/app.js') return send(res, 200, script, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && path === '/style.css') return send(res, 200, styles, 'text/css; charset=utf-8');
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong' });
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
