import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('.', import.meta.url));
const databasePath = process.env.DB_PATH || `${root}workboard.sqlite`;
const port = Number.parseInt(process.env.PORT || '8080', 10);
const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readRequestBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = insertProject.run(name);
    sendJson(response, 201, findProject.get(Number(result.lastInsertRowid)));
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = findProject.get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(`${root}public/index.html`);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    } catch {
      sendJson(response, 500, { error: 'Application could not be loaded' });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/app.js') {
    try {
      const script = await readFile(`${root}public/app.js`);
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(script);
    } catch {
      sendJson(response, 404, { error: 'Not found' });
    }
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
