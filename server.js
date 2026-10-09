import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openStore } from './store.js';

const store = openStore(process.env.DB_PATH || 'data/workboard.sqlite');
const assets = new Map([
  ['/', { type: 'text/html; charset=utf-8', body: readFileSync(new URL('./public/index.html', import.meta.url)) }],
  ['/app.js', { type: 'text/javascript; charset=utf-8', body: readFileSync(new URL('./public/app.js', import.meta.url)) }],
  ['/style.css', { type: 'text/css; charset=utf-8', body: readFileSync(new URL('./public/style.css', import.meta.url)) }],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects') {
      if (request.method === 'GET') return sendJson(response, 200, store.listProjects());
      if (request.method === 'POST') {
        const input = await readJson(request);
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        return sendJson(response, 201, store.createProject(name));
      }
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? store.getProject(id) : undefined;
      return project
        ? sendJson(response, 200, project)
        : sendJson(response, 404, { error: 'Project not found' });
    }
    const assetPath = /^\/projects\/[1-9]\d*$/.test(pathname) ? '/' : pathname;
    const asset = assets.get(assetPath);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset.type });
      return response.end(asset.body);
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
