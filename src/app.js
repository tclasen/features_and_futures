import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openWorkboardStore } from './store.js';
import { notFoundPage, projectPage, projectsPage } from './views.js';

const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const browserScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

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
      const error = new Error('Form is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createWorkboardServer(databasePath) {
  const store = openWorkboardStore(databasePath);
  const server = createServer(async (request, response) => {
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && pathname === '/health') {
        send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
      } else if (request.method === 'GET' && pathname === '/styles.css') {
        send(response, 200, styles, 'text/css; charset=utf-8');
      } else if (request.method === 'GET' && pathname === '/app.js') {
        send(response, 200, browserScript, 'text/javascript; charset=utf-8');
      } else if (request.method === 'GET' && pathname === '/') {
        const filter = projectFilter(searchParams.get('filter'));
        send(response, 200, projectsPage(store.list(filter), '', '', filter));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = form.get('name') ?? '';
        const project = store.create(name);
        if (project.error) {
          send(response, 400, projectsPage(store.list(), project.error, name));
        } else {
          redirect(response, '/');
        }
      } else if (/^\/projects\/[1-9]\d*(?:\/(?:archive|restore|tasks(?:\/[1-9]\d*\/completion)?))?$/.test(pathname)) {
        const parts = pathname.split('/');
        const id = Number(parts[2]);
        const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
        if (!project) {
          send(response, 404, notFoundPage());
        } else if (request.method === 'GET' && parts.length === 3) {
          const filter = taskFilter(searchParams.get('filter'));
          send(response, 200, projectPage(project, store.tasks.list(id, filter), filter));
        } else if (request.method === 'POST' && ['archive', 'restore'].includes(parts[3])) {
          const archived = parts[3] === 'archive';
          store.setArchived(id, archived);
          redirect(response, archived ? '/' : '/?filter=Archived');
        } else if (request.method === 'POST' && parts[3] === 'tasks') {
          if (project.archived) {
            send(response, 409, 'Archived project cannot be changed', 'text/plain; charset=utf-8');
            return;
          }
          const form = await readForm(request);
          const filter = taskFilter(form.get('filter'));
          if (parts.length === 4) {
            const title = form.get('title') ?? '';
            const task = store.tasks.create(id, title);
            if (task.error) {
              send(response, 400, projectPage(project, store.tasks.list(id, filter), filter, task.error, title));
              return;
            }
          } else {
            const taskId = Number(parts[4]);
            if (!Number.isSafeInteger(taskId) || !store.tasks.setCompleted(id, taskId, form.get('completed') === 'on')) {
              send(response, 404, notFoundPage());
              return;
            }
          }
          redirect(response, `/projects/${id}?filter=${filter}`);
        } else {
          send(response, 404, notFoundPage());
        }
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
  server.on('close', () => store.close());
  return server;
}
