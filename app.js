import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request is too large');
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

export function createApp(store) {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return json(response, 200, { status: 'ok' });
      }
      if (path === '/api/projects' && request.method === 'GET') {
        return json(response, 200, store.listProjects());
      }
      if (path === '/api/projects' && request.method === 'POST') {
        const input = await readJson(request);
        if (typeof input?.name !== 'string' || !input.name.trim()) {
          return json(response, 400, { error: 'Project name is required' });
        }
        return json(response, 201, store.createProject(input.name));
      }
      const detail = path.match(/^\/api\/projects\/([1-9]\d*)$/);
      if (request.method === 'GET' && detail) {
        const project = store.getProject(Number(detail[1]));
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'GET') {
        const asset = assets.get(/^\/projects\/[1-9]\d*$/.test(path) ? '/' : path);
        if (asset) {
          response.writeHead(200, { 'Content-Type': asset[0] });
          return response.end(asset[1]);
        }
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
      } else {
        response.end();
      }
    }
  });
}
