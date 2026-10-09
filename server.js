import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { openStore } from './store.js';

const store = openStore(process.env.DB_PATH || 'data/workboard.sqlite');
const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request too large');
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
      return json(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects') {
      if (request.method === 'GET') return json(response, 200, store.listProjects());
      if (request.method === 'POST') {
        const body = await readJson(request);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name) return json(response, 400, { error: 'Project name is required' });
        return json(response, 201, store.createProject(name));
      }
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? store.getProject(id) : undefined;
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET') {
      const asset = assets.get(pathname);
      if (asset || pathname === '/' || /^\/projects\/[1-9]\d*$/.test(pathname)) {
        const [file, contentType] = asset || ['index.html', 'text/html; charset=utf-8'];
        const contents = await readFile(new URL(`./public/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType });
        return response.end(contents);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
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
