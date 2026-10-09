import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createApp(store) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (pathname === '/api/projects' && request.method === 'GET') {
        return json(response, 200, store.list());
      }
      if (pathname === '/api/projects' && request.method === 'POST') {
        let body;
        try {
          body = await readJson(request);
        } catch {
          return json(response, 400, { error: 'Invalid JSON request' });
        }
        if (typeof body?.name !== 'string' || !body.name.trim()) {
          return json(response, 400, { error: 'Project name is required' });
        }
        return json(response, 201, store.create(body.name));
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
      console.error(error);
      json(response, 500, { error: 'Unable to complete request' });
    }
  });
}
