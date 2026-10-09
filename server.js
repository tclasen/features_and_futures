import { createServer } from 'node:http';
import { openProjectStore } from './database.js';
import { notFoundPage, projectListPage, projectPage } from './pages.js';

const store = openProjectStore(process.env.DB_PATH || 'data/workboard.sqlite');

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

async function readForm(request) {
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
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      html(response, 200, projectListPage(store.list()));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = form.get('name') || '';
      if (!name.trim()) {
        html(response, 422, projectListPage(store.list(), 'Project name is required', name));
        return;
      }
      store.create(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      html(response, project ? 200 : 404, project ? projectPage(project) : notFoundPage());
    } else {
      html(response, 404, notFoundPage());
    }
  } catch (error) {
    if (!error.status) console.error(error);
    response.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.status ? error.message : 'Internal server error');
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
