import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';
import { notFoundPage, projectPage, projectsPage } from './views.js';

const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

function send(response, status, body, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) {
      const error = new Error('Project form is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createWorkboardServer(databasePath) {
  const projects = openProjects(databasePath);
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && pathname === '/health') {
        send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
      } else if (request.method === 'GET' && pathname === '/styles.css') {
        send(response, 200, styles, 'text/css; charset=utf-8');
      } else if (request.method === 'GET' && pathname === '/') {
        send(response, 200, projectsPage(projects.list()));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = form.get('name') ?? '';
        const project = projects.create(name);
        if (project.error) {
          send(response, 400, projectsPage(projects.list(), project.error, name));
        } else {
          response.writeHead(303, { Location: '/' });
          response.end();
        }
      } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? projects.find(id) : undefined;
        send(response, project ? 200 : 404, project ? projectPage(project) : notFoundPage());
      } else {
        send(response, 404, notFoundPage());
      }
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        send(response, error.status ?? 500, error.status ? error.message : 'Unable to complete request', 'text/plain; charset=utf-8');
      } else {
        response.end();
      }
    }
  });
  server.on('close', () => projects.close());
  return server;
}
