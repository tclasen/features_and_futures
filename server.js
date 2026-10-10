import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openWorkboard } from './database.js';
import { projectsPage, projectPage, notFoundPage } from './pages.js';
import { normalizeDueDate, normalizeDueRange } from './due-date.js';
import { normalizeSearchQuery } from './search.js';

const port = Number(process.env.PORT ?? 8080);
const projects = openWorkboard(process.env.DB_PATH ?? './data/workboard.sqlite');
const styles = readFileSync(new URL('./public/styles.css', import.meta.url));
const appScript = readFileSync(new URL('./public/app.js', import.meta.url));

function taskFilter(value) {
  return ['open', 'completed'].includes(value) ? value : 'all';
}

function priorityFilter(value) {
  return ['low', 'normal', 'high'].includes(value) ? value : 'all';
}

function taskView(params) {
  const requested = normalizeDueRange(params.get('dueFrom') ?? '', params.get('dueThrough') ?? '');
  // The range form carries the applied boundaries so invalid submissions retain membership.
  const previous = normalizeDueRange(params.get('appliedDueFrom') ?? '', params.get('appliedDueThrough') ?? '');
  return {
    query: normalizeSearchQuery(params.get('query')),
    filter: taskFilter(params.get('filter')),
    priority: priorityFilter(params.get('priorityFilter')),
    dueRange: requested.range ?? previous.range ?? { from: '', through: '' },
    error: requested.error,
  };
}

function renderProject(project, view, error = view.error) {
  const { filter, priority, dueRange, query } = view;
  const destinations = projects.list().filter((candidate) => candidate.id !== project.id);
  return projectPage(project, projects.tasks.list(project.id, filter, priority, dueRange, query), filter, error, priority, dueRange, destinations, query);
}

function projectLocation(id, { filter, priority, dueRange, query }) {
  const params = new URLSearchParams({ filter });
  if (query) params.set('query', query);
  if (priority !== 'all') params.set('priorityFilter', priority);
  if (dueRange.from) params.set('dueFrom', dueRange.from);
  if (dueRange.through) params.set('dueThrough', dueRange.through);
  return `/projects/${id}?${params}`;
}

function projectFilter(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

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
    } else if (request.method === 'GET' && url.pathname === '/app.js') {
      send(response, 200, appScript, 'text/javascript; charset=utf-8');
    } else if (request.method === 'GET' && url.pathname === '/') {
      const filter = projectFilter(url.searchParams.get('filter'));
      const query = normalizeSearchQuery(url.searchParams.get('query'));
      send(response, 200, projectsPage(projects.list(filter, query), '', filter, query));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const filter = projectFilter(form.get('filter'));
      const query = normalizeSearchQuery(form.get('query'));
      const project = projects.create(form.get('name'));
      if (!project) {
        send(response, 400, projectsPage(projects.list(filter, query), 'Project name is required', filter, query));
      } else {
        redirect(response, '/');
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const id = Number(parts[2]);
      const form = await readForm(request);
      if (!Number.isSafeInteger(id) || !projects.setArchived(id, parts[3] === 'archive')) {
        send(response, 404, notFoundPage());
        return;
      }
      const params = new URLSearchParams({ filter: projectFilter(form.get('filter')) });
      const query = normalizeSearchQuery(form.get('query'));
      if (query) params.set('query', query);
      redirect(response, `/?${params}`);
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (!project) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const view = taskView(form);
      if (project.archived) {
        send(response, 409, renderProject(project, view, 'Archived project'));
      } else if (!projects.rename(id, form.get('name'))) {
        send(response, 400, renderProject(project, view, 'Project name is required'));
      } else {
        redirect(response, projectLocation(id, view));
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (!project) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const view = taskView(form);
      if (project.archived) {
        send(response, 409, renderProject(project, view, 'Archived project'));
      } else if (!projects.setDefaultPriority(id, form.get('priority'))) {
        send(response, 400, renderProject(project, view, 'Invalid task priority'));
      } else {
        redirect(response, projectLocation(id, view));
      }
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      const view = taskView(url.searchParams);
      send(response, project ? (view.error ? 400 : 200) : 404, project
        ? renderProject(project, view) : notFoundPage());
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/(?:completion|rename|priority|due-date|notes|move))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const taskId = parts[4] ? Number(parts[4]) : null;
      const project = Number.isSafeInteger(projectId) ? projects.find(projectId) : null;
      if (!project || (taskId !== null && !Number.isSafeInteger(taskId))) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const view = taskView(form);
      if (project.archived) {
        send(response, 409, renderProject(project, view, 'Archived project'));
        return;
      }
      if (taskId === null) {
        if (!projects.tasks.create(projectId, form.get('title'))) {
          send(response, 400, renderProject(project, view, 'Task title is required'));
          return;
        }
      } else if (parts[5] === 'notes') {
        if (!projects.tasks.setNotes(projectId, taskId, form.get('notes'))) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (parts[5] === 'move') {
        const destinationId = Number(form.get('destinationId'));
        if (!projects.tasks.move(projectId, taskId, destinationId)) {
          send(response, 400, renderProject(project, view, 'Unable to move task to that project'));
          return;
        }
      } else if (parts[5] === 'due-date') {
        const date = normalizeDueDate(form.get('dueDate'));
        if (date === null) {
          send(response, 400, renderProject(project, view, 'Due date must be a valid YYYY-MM-DD date'));
          return;
        }
        if (!projects.tasks.setDueDate(projectId, taskId, date)) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (parts[5] === 'priority') {
        const taskPriority = form.get('priority');
        if (!['low', 'normal', 'high'].includes(taskPriority)) {
          send(response, 400, renderProject(project, view, 'Invalid task priority'));
          return;
        }
        if (!projects.tasks.setPriority(projectId, taskId, taskPriority)) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (parts[5] === 'rename') {
        const title = form.get('title');
        if (!title?.trim()) {
          send(response, 400, renderProject(project, view, 'Task title is required'));
          return;
        }
        if (!projects.tasks.rename(projectId, taskId, title)) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (!projects.tasks.setCompleted(projectId, taskId, form.get('completed') === 'true')) {
        send(response, 404, notFoundPage());
        return;
      }
      redirect(response, projectLocation(projectId, view));
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
