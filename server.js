import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
};

const app = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return send(response, 200, JSON.stringify(database.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try { name = String(JSON.parse(body).name ?? '').trim(); } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try { return send(response, 200, await readFile(path.join(directory, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(response, 500, 'Application page unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(response, 404, JSON.stringify({ error: 'Not found' }));
});

app.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));
