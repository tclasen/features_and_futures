import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';
import { projectsPage, projectPage, notFoundPage } from './views.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));

function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function readForm(request) {
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
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, 'application/json', JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && path === '/styles.css') {
      return send(response, 200, 'text/css; charset=utf-8', stylesheet);
    }
    if (request.method === 'GET' && path === '/') {
      return send(response, 200, 'text/html; charset=utf-8', projectsPage(projects.list()));
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      if (!projects.create(form.get('name') || '')) {
        return send(response, 400, 'text/html; charset=utf-8',
          projectsPage(projects.list(), 'Project name is required'));
      }
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const match = path.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match && Number.isSafeInteger(Number(match[1]))) {
      const project = projects.find(Number(match[1]));
      if (project) return send(response, 200, 'text/html; charset=utf-8', projectPage(project));
    }
    send(response, 404, 'text/html; charset=utf-8', notFoundPage());
  } catch (error) {
    if (!error.status) console.error(error);
    send(response, error.status || 500, 'text/plain; charset=utf-8',
      error.status ? error.message : 'Internal server error');
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      projects.close();
      process.exit(0);
    });
  });
}
