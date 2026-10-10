import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res, status, data) => send(res, status, JSON.stringify(data));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, listProjects.all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) return json(res, 413, { error: 'Request too large' });
      }
      const payload = JSON.parse(raw);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name };
      insertProject.run(project.id, project.name, Date.now());
      return json(res, 201, project);
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(projectMatch[1]);
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Unable to load application' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
