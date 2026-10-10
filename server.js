import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const htmlPath = fileURLToPath(new URL('./public/index.html', import.meta.url));
const jsPath = fileURLToPath(new URL('./public/app.js', import.meta.url));
const cssPath = fileURLToPath(new URL('./public/style.css', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
async function bodyJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error('Request too large');
  }
  return JSON.parse(data || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ status: 'ok' }));
    if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, JSON.stringify(listProjects.all()));
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const data = await bodyJson(req);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = addProject.run(name);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(Number(projectMatch[1]));
      return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      return send(res, 200, await readFile(htmlPath, 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, await readFile(jsPath, 'utf8'), 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/style.css') return send(res, 200, await readFile(cssPath, 'utf8'), 'text/css; charset=utf-8');
    send(res, 404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    send(res, error.message === 'Request too large' ? 413 : 400, JSON.stringify({ error: 'Invalid request' }));
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
