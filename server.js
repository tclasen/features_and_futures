import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { openProjectStore } from './database.js';

const store = openProjectStore(process.env.DB_PATH || './data/workboard.sqlite');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
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
    if (size > 65536) {
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
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects') {
      if (request.method === 'GET') return json(response, 200, store.list());
      if (request.method === 'POST') {
        const body = await readJson(request);
        if (typeof body?.name !== 'string' || !body.name.trim()) {
          return json(response, 400, { error: 'Project name is required' });
        }
        return json(response, 201, store.create(body.name));
      }
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = store.find(projectMatch[1]);
      return project
        ? json(response, 200, project)
        : json(response, 404, { error: 'Project not found' });
    }
    const asset = /^\/projects\/[1-9]\d*$/.test(pathname)
      ? assets.get('/')
      : assets.get(pathname);
    if (request.method === 'GET' && asset) {
      const content = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] });
      return response.end(content);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, {
      error: error.status ? error.message : 'Unable to complete request',
    });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
