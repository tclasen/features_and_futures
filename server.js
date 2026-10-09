import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  const { dirname: pathDirname } = await import('node:path');
  await mkdir(pathDirname(dbPath), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { name } = JSON.parse(raw);
      if (typeof name !== 'string' || !name.trim()) return send(res, 400, { error: 'Project name is required' });
      const project = { id: randomUUID(), name: name.trim() };
      db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
      return send(res, 201, project);
    } catch {
      return send(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) {
    try { return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(res, 404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
