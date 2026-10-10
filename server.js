import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'data/workboard.sqlite'));
await mkdir(resolve(dbPath, '..'), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, listProjects.all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let payload;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    createProject.run(project.id, project.name, Date.now());
    return sendJson(res, 201, project);
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(decodeURIComponent(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(publicRoot, relative);
    if (file !== publicRoot && !file.startsWith(publicRoot + sep)) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(file);
      res.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream' });
      res.end(content);
      return;
    } catch {
      // Unknown browser routes use the same entry point; missing assets remain 404.
      if (!extname(relative)) {
        const content = await readFile(resolve(publicRoot, 'index.html'));
        res.writeHead(200, { 'content-type': mimeTypes['.html'] });
        res.end(content);
        return;
      }
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    else res.destroy();
  });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
