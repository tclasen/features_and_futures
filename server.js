import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
      const error = new Error('Request body is too large');
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

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (pathname === '/api/projects') {
      if (request.method === 'GET') return json(response, 200, projects.list());
      if (request.method === 'POST') {
        const body = await readJson(request);
        const project = projects.create(body?.name);
        return project
          ? json(response, 201, project)
          : json(response, 400, { error: 'Project name is required' });
      }
    }
    const projectRoute = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      return project
        ? json(response, 200, project)
        : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET') {
      const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(pathname) ? '/' : pathname);
      if (asset) {
        response.writeHead(200, { 'Content-Type': asset[0] });
        return response.end(asset[1]);
      }
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) {
      json(response, error.status || 500, { error: error.status ? error.message : 'Server error' });
    } else {
      response.end();
    }
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
