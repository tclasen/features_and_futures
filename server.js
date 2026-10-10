import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openWorkboard } from './database.js';
import { projectsPage, projectPage, notFoundPage } from './pages.js';
import { normalizeDueDate } from './due-date.js';

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

function renderProject(project, filter, priority, error = '') {
  return projectPage(project, projects.tasks.list(project.id, filter, priority), filter, error, priority);
}

function projectLocation(id, filter, priority) {
  return `/projects/${id}?filter=${filter}${priority === 'all' ? '' : `&priorityFilter=${priority}`}`;
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
      send(response, 200, projectsPage(projects.list(filter), '', filter));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const project = projects.create(form.get('name'));
      if (!project) {
        const filter = projectFilter(form.get('filter'));
        send(response, 400, projectsPage(projects.list(filter), 'Project name is required', filter));
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
      redirect(response, `/?filter=${projectFilter(form.get('filter'))}`);
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (!project) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        send(response, 409, renderProject(project, filter, priority, 'Archived project'));
      } else if (!projects.rename(id, form.get('name'))) {
        send(response, 400, renderProject(project, filter, priority, 'Project name is required'));
      } else {
        redirect(response, projectLocation(id, filter, priority));
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (!project) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        send(response, 409, renderProject(project, filter, priority, 'Archived project'));
      } else if (!projects.setDefaultPriority(id, form.get('priority'))) {
        send(response, 400, renderProject(project, filter, priority, 'Invalid task priority'));
      } else {
        redirect(response, projectLocation(id, filter, priority));
      }
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      const filter = taskFilter(url.searchParams.get('filter'));
      const priority = priorityFilter(url.searchParams.get('priorityFilter'));
      send(response, project ? 200 : 404, project
        ? renderProject(project, filter, priority) : notFoundPage());
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/(?:completion|rename|priority|due-date))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const taskId = parts[4] ? Number(parts[4]) : null;
      const project = Number.isSafeInteger(projectId) ? projects.find(projectId) : null;
      if (!project || (taskId !== null && !Number.isSafeInteger(taskId))) {
        send(response, 404, notFoundPage());
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        send(response, 409, renderProject(project, filter, priority, 'Archived project'));
        return;
      }
      if (taskId === null) {
        if (!projects.tasks.create(projectId, form.get('title'))) {
          send(response, 400, renderProject(project, filter, priority, 'Task title is required'));
          return;
        }
      } else if (parts[5] === 'due-date') {
        const date = normalizeDueDate(form.get('dueDate'));
        if (date === null) {
          send(response, 400, renderProject(project, filter, priority, 'Due date must be a valid YYYY-MM-DD date'));
          return;
        }
        if (!projects.tasks.setDueDate(projectId, taskId, date)) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (parts[5] === 'priority') {
        const taskPriority = form.get('priority');
        if (!['low', 'normal', 'high'].includes(taskPriority)) {
          send(response, 400, renderProject(project, filter, priority, 'Invalid task priority'));
          return;
        }
        if (!projects.tasks.setPriority(projectId, taskId, taskPriority)) {
          send(response, 404, notFoundPage());
          return;
        }
      } else if (parts[5] === 'rename') {
        const title = form.get('title');
        if (!title?.trim()) {
          send(response, 400, renderProject(project, filter, priority, 'Task title is required'));
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
      redirect(response, projectLocation(projectId, filter, priority));
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
