import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0)
)`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
      const error = new Error('Request is too large');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && pathname === '/api/projects') {
      return sendJson(response, 200, listProjects.all());
    }
    if (request.method === 'POST' && pathname === '/api/projects') {
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return sendJson(response, 201, findProject.get(Number(result.lastInsertRowid)));
    }
    const projectMatch = /^\/api\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return project
        ? sendJson(response, 200, project)
        : sendJson(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET') {
      const asset = assets.get(pathname);
      const isPage = pathname === '/' || /^\/projects\/[1-9]\d*$/.test(pathname);
      if (asset || isPage) {
        const [file, contentType] = asset ?? ['index.html', 'text/html; charset=utf-8'];
        const content = await readFile(new URL(`./public/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType });
        return response.end(content);
      }
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    sendJson(response, error.status ?? 500, { error: error.status ? error.message : 'Unable to complete request' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));
function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
