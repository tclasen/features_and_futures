import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openProjects } from './projects.js';
import { projectsPage, projectPage, notFoundPage } from './views.js';
import { TASK_PRIORITIES } from './task-priorities.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));
const formScript = readFileSync(new URL('./public/forms.js', import.meta.url));

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
      return send(response, 200, 'text/html; charset=utf-8', projectsPage(projects.list(filter), '', filter));
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const filter = projectFilter(form.get('filter'));
      if (!projects.create(form.get('name') || '')) {
        return send(response, 400, 'text/html; charset=utf-8',
          projectsPage(projects.list(filter), 'Project name is required', filter));
      }
      return redirect(response, '/');
    }
    const archiveMatch = path.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch && Number.isSafeInteger(Number(archiveMatch[1]))) {
      if (projects.setArchived(Number(archiveMatch[1]), archiveMatch[2] === 'archive')) {
        return redirect(response, archiveMatch[2] === 'restore' ? '/?filter=Archived' : '/');
      }
    }
    const match = path.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match && Number.isSafeInteger(Number(match[1]))) {
      const project = projects.find(Number(match[1]));
      if (project) {
        const filter = taskFilter(url.searchParams.get('filter'));
        return send(response, 200, 'text/html; charset=utf-8',
          projectPage(project, projects.listTasks(project.id, filter), filter));
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
        const filter = taskFilter(form.get('filter'));
        if (!projects.rename(project.id, form.get('name') || '')) {
          return send(response, 400, 'text/html; charset=utf-8',
            projectPage(project, projects.listTasks(project.id, filter), filter, 'Project name is required'));
        }
        return redirect(response, `/projects/${project.id}?filter=${filter}`);
      }
    }
    const taskMatch = path.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority))?$/);
    if (request.method === 'POST' && taskMatch &&
        Number.isSafeInteger(Number(taskMatch[1])) &&
        (!taskMatch[2] || Number.isSafeInteger(Number(taskMatch[2])))) {
      const project = projects.find(Number(taskMatch[1]));
      if (project) {
        if (project.archived) {
          return send(response, 409, 'text/plain; charset=utf-8', 'Archived project');
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (taskMatch[3] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            return send(response, 400, 'text/html; charset=utf-8',
              projectPage(project, projects.listTasks(project.id, filter), filter, 'Task title is required'));
          }
          if (!projects.renameTask(project.id, Number(taskMatch[2]), title)) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[3] === 'priority') {
          const priority = form.get('priority');
          if (!TASK_PRIORITIES.includes(priority)) {
            return send(response, 400, 'text/html; charset=utf-8',
              projectPage(project, projects.listTasks(project.id, filter), filter, 'Invalid task priority'));
          }
          if (!projects.setTaskPriority(project.id, Number(taskMatch[2]), priority)) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (taskMatch[2]) {
          if (!projects.setTaskCompleted(project.id, Number(taskMatch[2]), form.has('completed'))) {
            return send(response, 404, 'text/html; charset=utf-8', notFoundPage());
          }
        } else if (!projects.createTask(project.id, form.get('title') || '')) {
          return send(response, 400, 'text/html; charset=utf-8',
            projectPage(project, projects.listTasks(project.id, filter), filter, 'Task title is required'));
        }
        return redirect(response, `/projects/${project.id}?filter=${filter}`);
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
