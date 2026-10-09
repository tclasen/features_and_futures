import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || join(directory, 'workboard.sqlite');
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
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

async function servePage(response, filename) {
  const contents = await readFile(resolve(directory, 'public', filename));
  const contentType = filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': contentType });
  response.end(contents);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      sendJson(response, 200, listProjects.all());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, findProject.get(result.lastInsertRowid));
      return;
    }

    const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(Number(projectRoute[1]));
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      sendJson(response, 200, project);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/styles.css') {
      const contents = await readFile(resolve(directory, 'public', 'styles.css'));
      response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      response.end(contents);
      return;
    }

    if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
      await servePage(response, 'index.html');
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: 'Invalid JSON' });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
