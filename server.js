import { createServer } from 'node:http';
import { openProjectStore } from './store.js';
import { notFoundPage, projectPage, projectsPage } from './views.js';

const port = Number(process.env.PORT ?? 8080);
const store = openProjectStore(process.env.DB_PATH ?? './data/workboard.sqlite');

function send(response, status, body, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
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
      return send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (request.method === 'GET' && pathname === '/') {
      return send(response, 200, projectsPage(store.list()));
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        return send(response, 422, projectsPage(store.list(), 'Project name is required'));
      }
      store.create(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (project) return send(response, 200, projectPage(project));
    }
    send(response, 404, notFoundPage());
  } catch (error) {
    if (error.status === 413) return send(response, 413, error.message, 'text/plain; charset=utf-8');
    console.error(error);
    send(response, 500, 'Internal server error', 'text/plain; charset=utf-8');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
