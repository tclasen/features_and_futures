import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openWorkboardStore } from './store.js';
import { normalizeDueRange } from './due-date.js';
import { notFoundPage, projectPage, projectsPage } from './views.js';

const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const browserScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function taskPriorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function readTaskSelection(params) {
  const range = normalizeDueRange(params.get('dueFrom') ?? '', params.get('dueThrough') ?? '');
  return {
    filter: taskFilter(params.get('filter')),
    priorityFilter: taskPriorityFilter(params.get('priorityFilter')),
    dueFrom: range.dueFrom ?? '', dueThrough: range.dueThrough ?? '',
  };
}

function projectLocation(id, { filter, priorityFilter, dueFrom, dueThrough }) {
  const query = new URLSearchParams({ filter });
  if (priorityFilter !== 'All') query.set('priorityFilter', priorityFilter);
  if (dueFrom) query.set('dueFrom', dueFrom);
  if (dueThrough) query.set('dueThrough', dueThrough);
  return `/projects/${id}?${query}`;
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
      } else if (/^\/projects\/[1-9]\d*(?:\/(?:archive|restore|rename|default-task-priority|tasks(?:\/[1-9]\d*\/(?:completion|rename|priority|due-date))?))?$/.test(pathname)) {
        const parts = pathname.split('/');
        const id = Number(parts[2]);
        const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
        if (!project) {
          send(response, 404, notFoundPage());
        } else if (request.method === 'GET' && parts.length === 3) {
          const selection = readTaskSelection(searchParams);
          let dueRangeState = {};
          if (searchParams.has('applyDueRange')) {
            const from = searchParams.get('rangeFrom') ?? '';
            const through = searchParams.get('rangeThrough') ?? '';
            const range = normalizeDueRange(from, through);
            if (!range.error) {
              redirect(response, projectLocation(id, { ...selection, ...range }));
              return;
            }
            dueRangeState = { error: range.error, from, through };
          }
          send(response, dueRangeState.error ? 400 : 200, projectPage(project,
            store.tasks.list(id, selection.filter, selection.priorityFilter, selection),
            { ...selection, dueRangeState }));
        } else if (request.method === 'POST' && ['archive', 'restore'].includes(parts[3])) {
          const archived = parts[3] === 'archive';
          store.setArchived(id, archived);
          redirect(response, archived ? '/' : '/?filter=Archived');
        } else if (request.method === 'POST' && parts[3] === 'default-task-priority') {
          const form = await readForm(request);
          const result = store.setDefaultTaskPriority(id, form.get('priority'));
          if (result.error) {
            send(response, result.status, result.error, 'text/plain; charset=utf-8');
          } else {
            redirect(response, projectLocation(id, readTaskSelection(form)));
          }
        } else if (request.method === 'POST' && parts[3] === 'rename') {
          const form = await readForm(request);
          const selection = readTaskSelection(form);
          const { filter, priorityFilter } = selection;
          const name = form.get('name') ?? '';
          const result = store.rename(id, name);
          if (result.error) {
            send(response, result.status, projectPage(project, store.tasks.list(id, filter, priorityFilter, selection), {
              ...selection, renameState: { error: result.error, submittedName: name },
            }));
          } else {
            redirect(response, projectLocation(id, selection));
          }
        } else if (request.method === 'POST' && parts[3] === 'tasks') {
          if (project.archived) {
            send(response, 409, 'Archived project cannot be changed', 'text/plain; charset=utf-8');
            return;
          }
          const form = await readForm(request);
          const selection = readTaskSelection(form);
          const { filter, priorityFilter } = selection;
          if (parts.length === 4) {
            const title = form.get('title') ?? '';
            const task = store.tasks.create(id, title);
            if (task.error) {
              send(response, 400, projectPage(project, store.tasks.list(id, filter, priorityFilter, selection), {
                ...selection, error: task.error, submittedTitle: title,
              }));
              return;
            }
          } else {
            const taskId = Number(parts[4]);
            if (!Number.isSafeInteger(taskId)) {
              send(response, 404, notFoundPage());
              return;
            }
            if (parts[5] === 'rename') {
              const title = form.get('title') ?? '';
              const result = store.tasks.rename(id, taskId, title);
              if (result.error) {
                send(response, result.status, result.status === 404 ? notFoundPage() :
                  projectPage(project, store.tasks.list(id, filter, priorityFilter, selection), {
                    ...selection,
                    taskRenameState: { taskId, error: result.error, submittedTitle: title },
                  }));
                return;
              }
            } else if (parts[5] === 'due-date') {
              const result = store.tasks.setDueDate(id, taskId, form.get('dueDate') ?? '');
              if (result.error) {
                send(response, result.status, result.status === 404 ? notFoundPage() :
                  projectPage(project, store.tasks.list(id, filter, priorityFilter, selection), {
                    ...selection, taskDueDateState: { taskId, error: result.error },
                  }));
                return;
              }
            } else if (parts[5] === 'priority') {
              const result = store.tasks.setPriority(id, taskId, form.get('priority'));
              if (result.error) {
                if (result.status === 404) {
                  send(response, 404, notFoundPage());
                } else {
                  send(response, result.status, result.error, 'text/plain; charset=utf-8');
                }
                return;
              }
            } else if (!store.tasks.setCompleted(id, taskId, form.get('completed') === 'on')) {
              send(response, 404, notFoundPage());
              return;
            }
          }
          redirect(response, projectLocation(id, selection));
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
