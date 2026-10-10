import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';
import { projectsPage, projectPage, notFoundPage } from './pages.js';

const port = Number(process.env.PORT ?? 8080);
const projects = openProjects(process.env.DB_PATH ?? './data/workboard.sqlite');
const styles = readFileSync(new URL('./public/styles.css', import.meta.url));

function send(response, status, body, type = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Form too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (request.method === 'GET' && url.pathname === '/styles.css') {
      send(response, 200, styles, 'text/css; charset=utf-8');
    } else if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, projectsPage(projects.list()));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const project = projects.create(form.get('name'));
      if (!project) {
        send(response, 400, projectsPage(projects.list(), 'Project name is required'));
      } else {
        response.writeHead(303, { Location: '/' });
        response.end();
      }
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      send(response, project ? 200 : 404, project ? projectPage(project) : notFoundPage());
    } else {
      send(response, 404, notFoundPage());
    }
  } catch (error) {
    if (!error.status) console.error(error);
    send(response, error.status ?? 500, error.status ? error.message : 'Internal server error', 'text/plain; charset=utf-8');
  }
});

server.listen(port, '0.0.0.0', () => {
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
