import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';
import { projectsPage, projectPage, notFoundPage } from './views.js';
import { normalizeSearchQuery } from './search.js';
import { TASK_PRIORITIES } from './task-priorities.js';
import { normalizeDueDate, normalizeDueRange, INVALID_DUE_DATE_MESSAGE } from './task-dates.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));
const formScript = readFileSync(new URL('./public/forms.js', import.meta.url));

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return TASK_PRIORITIES.includes(value) ? value : 'All';
}

function projectFilters(parameters) {
  const range = normalizeDueRange(parameters.get('dueFrom') || '', parameters.get('dueThrough') || '');
  return {
    search: normalizeSearchQuery(parameters.get('search') || ''),
    completion: taskFilter(parameters.get('filter')),
    priority: priorityFilter(parameters.get('priorityFilter')),
    dueFrom: range.dueFrom || '',
    dueThrough: range.dueThrough || '',
  };
}

function renderProject(project, filters, error = '') {
  return projectPage(project, projects.listTasks(project.id, filters.completion, filters.priority, filters),
    filters.completion, error, filters.priority, filters,
    projects.list().filter((destination) => destination.id !== project.id));
}

function projectLocation(projectId, filters) {
  const query = new URLSearchParams({ filter: filters.completion });
  if (filters.priority !== 'All') query.set('priorityFilter', filters.priority);
  if (filters.dueFrom) query.set('dueFrom', filters.dueFrom);
  if (filters.dueThrough) query.set('dueThrough', filters.dueThrough);
  if (filters.search) query.set('search', filters.search);
  return `/projects/${projectId}?${query}`;
}

function projectsLocation(filter, search) {
  const query = new URLSearchParams();
  if (filter !== 'Active') query.set('filter', filter);
  if (search) query.set('search', search);
  return query.size ? `/?${query}` : '/';
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request too large');
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
    const path = url.pathname;
    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, 'application/json', JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && path === '/styles.css') {
      return send(response, 200, 'text/css; charset=utf-8', stylesheet);
    }
    if (request.method === 'GET' && path === '/forms.js') {
      return send(response, 200, 'text/javascript; charset=utf-8', formScript);
    }
    if (request.method === 'GET' && path === '/') {
      const filter = projectFilter(url.searchParams.get('filter'));
      const search = normalizeSearchQuery(url.searchParams.get('search') || '');
      return send(response, 200, 'text/html; charset=utf-8', projectsPage(projects.list(filter, search), '', filter, search));
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const filter = projectFilter(form.get('filter'));
      const search = normalizeSearchQuery(form.get('search') || '');
      if (!projects.create(form.get('name') || '')) {
        return send(response, 400, 'text/html; charset=utf-8',
          projectsPage(projects.list(filter, search), 'Project name is required', filter, search));
      }
      return redirect(response, projectsLocation(filter, search));
    }
    const archiveMatch = path.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch && Number.isSafeInteger(Number(archiveMatch[1]))) {
      const form = await readForm(request);
      if (projects.setArchived(Number(archiveMatch[1]), archiveMatch[2] === 'archive')) {
        const filter = projectFilter(form.get('filter') || (archiveMatch[2] === 'restore' ? 'Archived' : 'Active'));
        const search = normalizeSearchQuery(form.get('search') || '');
        return redirect(response, projectsLocation(filter, search));
      }
    }
    const match = path.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match && Number.isSafeInteger(Number(match[1]))) {
      const project = projects.find(Number(match[1]));
      if (project) {
        const filters = projectFilters(url.searchParams);
        return send(response, 200, 'text/html; charset=utf-8',
          renderProject(project, filters));
      }
    }
    const dueRangeMatch = path.match(/^\/projects\/([1-9]\d*)\/due-range$/);
    if (request.method === 'POST' && dueRangeMatch && Number.isSafeInteger(Number(dueRangeMatch[1]))) {
      const project = projects.find(Number(dueRangeMatch[1]));
      if (project) {
        const form = await readForm(request);
        const filters = projectFilters(form);
        const range = normalizeDueRange(form.get('rangeFrom') || '', form.get('rangeThrough') || '');
        if (range.error) {
          return send(response, 400, 'text/html; charset=utf-8', renderProject(project, filters, range.error));
        }
        return redirect(response, projectLocation(project.id, { ...filters, ...range }));
      }
    }
    const defaultPriorityMatch = path.match(/^\/projects\/([1-9]\d*)\/default-priority$/);
    if (request.method === 'POST' && defaultPriorityMatch && Number.isSafeInteger(Number(defaultPriorityMatch[1]))) {
      const project = projects.find(Number(defaultPriorityMatch[1]));
      if (project) {
        if (project.archived) {
          return send(response, 409, 'text/plain; charset=utf-8', 'Archived project');
        }
        const form = await readForm(request);
        const filters = projectFilters(form);
        if (!projects.setDefaultTaskPriority(project.id, form.get('priority'))) {
          return send(response, 400, 'text/html; charset=utf-8',
            renderProject(project, filters, 'Invalid task priority'));
        }
        return redirect(response, projectLocation(project.id, filters));
      }
    }
    const renameMatch = path.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (request.method === 'POST' && renameMatch && Number.isSafeInteger(Number(renameMatch[1]))) {
      const project = projects.find(Number(renameMatch[1]));
      if (project) {
        if (project.archived) {
          return send(response, 409, 'text/plain; charset=utf-8', 'Archived project');
        }
        const form = await readForm(request);
        const filters = projectFilters(form);
        if (!projects.rename(project.id, form.get('name') || '')) {
          return send(response, 400, 'text/html; charset=utf-8',
            renderProject(project, filters, 'Project name is required'));
        }
        return redirect(response, projectLocation(project.id, filters));
      }
    }
    const taskMatch = path.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date|notes|move))?$/);
    if (request.method === 'POST' && taskMatch &&
        Number.isSafeInteger(Number(taskMatch[1])) &&
        (!taskMatch[2] || Number.isSafeInteger(Number(taskMatch[2])))) {
      const project = projects.find(Number(taskMatch[1]));
      if (project) {
        if (project.archived) {
          return send(response, 409, 'text/plain; charset=utf-8', 'Archived project');
        }
        const form = await readForm(request);
        const filters = projectFilters(form);
        if (taskMatch[3] === 'notes') {
          if (!projects.setTaskNotes(project.id, Number(taskMatch[2]), form.get('notes') || '')) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[3] === 'move') {
          const destination = form.get('destination');
          if (!/^[1-9]\d*$/.test(destination || '') ||
              !projects.moveTask(project.id, Number(taskMatch[2]), Number(destination))) {
            return send(response, 400, 'text/html; charset=utf-8',
              renderProject(project, filters, 'Task cannot be moved to that project'));
          }
        } else if (taskMatch[3] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            return send(response, 400, 'text/html; charset=utf-8',
              renderProject(project, filters, 'Task title is required'));
          }
          if (!projects.renameTask(project.id, Number(taskMatch[2]), title)) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[3] === 'priority') {
          const priority = form.get('priority');
          if (!TASK_PRIORITIES.includes(priority)) {
            return send(response, 400, 'text/html; charset=utf-8',
              renderProject(project, filters, 'Invalid task priority'));
          }
          if (!projects.setTaskPriority(project.id, Number(taskMatch[2]), priority)) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[3] === 'due-date') {
          const date = normalizeDueDate(form.get('dueDate') || '');
          if (date === null) {
            return send(response, 400, 'text/html; charset=utf-8',
              renderProject(project, filters, INVALID_DUE_DATE_MESSAGE));
          }
          if (!projects.setTaskDueDate(project.id, Number(taskMatch[2]), date)) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[2]) {
          if (!projects.setTaskCompleted(project.id, Number(taskMatch[2]), form.has('completed'))) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (!projects.createTask(project.id, form.get('title') || '')) {
          return send(response, 400, 'text/html; charset=utf-8',
            renderProject(project, filters, 'Task title is required'));
        }
        return redirect(response, projectLocation(project.id, filters));
      }
    }
    send(response, 404, 'text/html; charset=utf-8', notFoundPage());
  } catch (error) {
    if (!error.status) console.error(error);
    send(response, error.status || 500, 'text/plain; charset=utf-8',
      error.status ? error.message : 'Internal server error');
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
