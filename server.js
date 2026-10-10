import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjectStore } from './project-store.js';

const store = openProjectStore(process.env.DB_PATH || 'data/workboard.sqlite');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
  ['/task-due-date.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-due-date.js', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
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
      if (request.method === 'GET') return json(response, 200, store.list());
      if (request.method === 'POST') {
        const input = await readJson(request);
        if (typeof input?.name !== 'string' || !input.name.trim()) {
          return json(response, 400, { error: 'Project name is required' });
        }
        return json(response, 201, store.create(input.name));
      }
    }
    const tasksApi = pathname.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (tasksApi) {
      const [, projectId, taskId] = tasksApi;
      if (!store.find(projectId)) return json(response, 404, { error: 'Project not found' });
      if (!taskId && request.method === 'GET') {
        return json(response, 200, store.listTasks(projectId));
      }
      if (!taskId && request.method === 'POST') {
        const input = await readJson(request);
        if (typeof input?.title !== 'string' || !input.title.trim()) {
          return json(response, 400, { error: 'Task title is required' });
        }
        return json(response, 201, store.createTask(projectId, input.title));
      }
      if (taskId && request.method === 'PATCH') {
        const input = await readJson(request);
        const fields = ['title', 'completed', 'priority', 'dueDate'].filter((field) => input && Object.hasOwn(input, field));
        if (fields.length > 1) {
          return json(response, 400, { error: 'Change task title, completion, priority, or due date separately' });
        }
        if (fields[0] === 'dueDate') {
          const task = store.setTaskDueDate(projectId, taskId, input.dueDate);
          return task
            ? json(response, 200, task)
            : json(response, 404, { error: 'Task not found' });
        }
        if (fields[0] === 'priority') {
          const task = store.setTaskPriority(projectId, taskId, input.priority);
          return task
            ? json(response, 200, task)
            : json(response, 404, { error: 'Task not found' });
        }
        if (input && Object.hasOwn(input, 'title')) {
          const task = store.renameTask(projectId, taskId, input.title);
          return task
            ? json(response, 200, task)
            : json(response, 404, { error: 'Task not found' });
        }
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Task completion must be a boolean' });
        }
        const task = store.setTaskCompletion(projectId, taskId, input.completed);
        return task
          ? json(response, 200, task)
          : json(response, 404, { error: 'Task not found' });
      }
    }
    const projectApi = pathname.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (projectApi) {
      if (request.method === 'GET') {
        const project = store.find(projectApi[1]);
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'PATCH') {
        const input = await readJson(request);
        const fields = ['name', 'archived', 'defaultTaskPriority'].filter((field) => input && Object.hasOwn(input, field));
        if (fields.length > 1) {
          return json(response, 400, { error: 'Change project name, archive state, or default task priority separately' });
        }
        if (fields[0] === 'defaultTaskPriority') {
          return json(response, 200, store.setDefaultTaskPriority(projectApi[1], input.defaultTaskPriority));
        }
        if (input && Object.hasOwn(input, 'name')) {
          return json(response, 200, store.rename(projectApi[1], input.name));
        }
        if (typeof input?.archived !== 'boolean') {
          return json(response, 400, { error: 'Project archive state must be a boolean' });
        }
        const project = store.setArchived(projectApi[1], input.archived);
        return project
          ? json(response, 200, project)
          : json(response, 404, { error: 'Project not found' });
      }
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
    json(response, error.status || 500, {
      error: error.status ? error.message : 'Unable to complete the request',
    });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
