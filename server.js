import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';

const projects = openProjects(process.env.DB_PATH || './data/workboard.sqlite');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/task-filters.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/task-filters.js', import.meta.url))]],
  ['/dates.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/dates.js', import.meta.url))]],
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
    if (Buffer.byteLength(body) > 65536) {
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
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, projects.list());
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request);
      if (typeof body?.name !== 'string' || !body.name.trim()) {
        return json(response, 400, { error: 'Project name is required' });
      }
      return json(response, 201, projects.create(body.name));
    }
    const tasksMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(\/(?:title|priority|due-date))?)?$/);
    if (tasksMatch) {
      const [, projectId, taskId, fieldPath] = tasksMatch;
      const project = projects.get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (!taskId && request.method === 'GET') {
        return json(response, 200, projects.tasks.list(projectId));
      }
      if (project.archived && (request.method === 'POST' || request.method === 'PATCH')) {
        return json(response, 409, { error: 'Archived project cannot be changed' });
      }
      if (!taskId && request.method === 'POST') {
        const body = await readJson(request);
        if (typeof body?.title !== 'string' || !body.title.trim()) {
          return json(response, 400, { error: 'Task title is required' });
        }
        return json(response, 201, projects.tasks.create(projectId, body.title, project.default_task_priority));
      }
      if (taskId && request.method === 'PATCH') {
        const body = await readJson(request);
        if (fieldPath === '/due-date') {
          const task = projects.tasks.setDueDate(projectId, taskId, body?.due_date);
          return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
        }
        if (fieldPath === '/priority') {
          const task = projects.tasks.setPriority(projectId, taskId, body?.priority);
          return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
        }
        if (fieldPath === '/title') {
          const task = projects.tasks.rename(projectId, taskId, body?.title);
          return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
        }
        if (typeof body?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        const task = projects.tasks.setCompleted(projectId, taskId, body.completed);
        return task ? json(response, 200, task) : json(response, 404, { error: 'Task not found' });
      }
    }
    const defaultPriorityMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/default-task-priority$/);
    if (request.method === 'PATCH' && defaultPriorityMatch) {
      const body = await readJson(request);
      const project = projects.setDefaultPriority(defaultPriorityMatch[1], body?.priority);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    const renameMatch = path.match(/^\/api\/projects\/([1-9]\d*)\/name$/);
    if (request.method === 'PATCH' && renameMatch) {
      const body = await readJson(request);
      const project = projects.rename(renameMatch[1], body?.name);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    const projectMatch = path.match(/^\/api\/projects\/([1-9]\d*)$/);
    if (request.method === 'PATCH' && projectMatch) {
      const body = await readJson(request);
      if (typeof body?.archived !== 'boolean') {
        return json(response, 400, { error: 'Archive state must be a boolean' });
      }
      const project = projects.setArchived(projectMatch[1], body.archived);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET' && projectMatch) {
      const project = projects.get(projectMatch[1]);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    const asset = assets.get(path) || (/^\/projects\/[1-9]\d*$/.test(path) ? assets.get('/') : null);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    projects.close();
    process.exit(0);
  }));
}
