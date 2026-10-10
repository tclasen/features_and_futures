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

function taskFilter(value) {
  return ['all', 'open', 'completed'].includes(value) ? value : 'all';
}

function projectFilter(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

const server = createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      return send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (request.method === 'GET' && pathname === '/') {
      const filter = projectFilter(searchParams.get('filter'));
      return send(response, 200, projectsPage(store.list(filter), '', filter));
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        const filter = projectFilter(form.get('filter'));
        return send(response, 422, projectsPage(store.list(filter), 'Project name is required', filter));
      }
      store.create(name);
      return redirect(response, '/');
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(pathname);
    if (request.method === 'POST' && archiveRoute) {
      const id = Number(archiveRoute[1]);
      if (!Number.isSafeInteger(id) || !store.setArchived(id, archiveRoute[2] === 'archive')) {
        return send(response, 404, notFoundPage());
      }
      return redirect(response, `/?filter=${archiveRoute[2] === 'archive' ? 'active' : 'archived'}`);
    }
    const projectRoute = /^\/projects\/([1-9]\d*)(?:\/rename|\/tasks(?:\/([1-9]\d*)\/(completion|rename))?)?$/.exec(pathname);
    if (projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (!project) return send(response, 404, notFoundPage());
      const projectPath = `/projects/${id}`;
      if (request.method === 'GET' && pathname === projectPath) {
        const filter = taskFilter(searchParams.get('filter'));
        return send(response, 200, projectPage(project, store.listTasks(id, filter), filter));
      }
      if (request.method === 'POST' && pathname !== projectPath) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          return send(response, 409, projectPage(project, store.listTasks(id, filter), filter, 'Archived project'));
        }
        if (pathname === `${projectPath}/rename`) {
          const name = (form.get('name') ?? '').trim();
          if (!name) {
            return send(response, 422, projectPage(project, store.listTasks(id, filter), filter, 'Project name is required'));
          }
          store.rename(id, name);
        } else if (projectRoute[2]) {
          const taskId = Number(projectRoute[2]);
          if (!Number.isSafeInteger(taskId)) return send(response, 404, notFoundPage());
          let updated;
          if (projectRoute[3] === 'rename') {
            const title = (form.get('title') ?? '').trim();
            if (!title) {
              return send(response, 422, projectPage(project, store.listTasks(id, filter), filter, 'Task title is required'));
            }
            updated = store.renameTask(id, taskId, title);
          } else {
            updated = store.setTaskCompleted(id, taskId, form.has('completed'));
          }
          if (!updated) {
            return send(response, 404, notFoundPage());
          }
        } else {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            return send(response, 422, projectPage(project, store.listTasks(id, filter), filter, 'Task title is required'));
          }
          store.createTask(id, title);
        }
        return redirect(response, `${projectPath}?filter=${filter}`);
      }
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
