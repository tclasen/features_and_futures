import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjectStore } from './projects.js';

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
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65536) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createWorkboard(dbPath) {
  const projects = openProjectStore(dbPath);
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (request.method === 'GET' && path === '/api/projects') {
        return json(response, 200, projects.list());
      }
      if (request.method === 'POST' && path === '/api/projects') {
        let body;
        try {
          body = await readJson(request);
        } catch {
          return json(response, 400, { error: 'Invalid JSON request' });
        }
        const project = projects.create(body?.name);
        return project
          ? json(response, 201, project)
          : json(response, 400, { error: 'Project name is required' });
      }
      const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
      if (request.method === 'GET' && projectMatch) {
        const id = Number(projectMatch[1]);
        const project = Number.isSafeInteger(id) ? projects.find(id) : undefined;
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
      const asset = assets.get(/^\/projects\/\d+$/.test(path) ? '/' : path);
      if (request.method === 'GET' && asset) {
        response.writeHead(200, { 'Content-Type': asset[0] });
        return response.end(asset[1]);
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Unable to complete request' });
      else response.end();
    }
  });
  server.on('close', () => projects.close());
  return server;
}
