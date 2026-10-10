import { createServer } from 'node:http';
import { openProjectStore } from './projects.js';
import { normalizeDueRange, matchesDueRange } from './dates.js';
import { matchesSearch } from './search.js';

const store = openProjectStore(process.env.DB_PATH || 'data/workboard.sqlite');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172b42; background: #f4f6f9; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, button, select { font: inherit; border-radius: 6px; padding: 10px 14px; }
    input { border: 1px solid #788799; max-width: 100%; box-sizing: border-box; }
    button { border: 1px solid #2257a0; background: #2257a0; color: white; cursor: pointer; }
    button:hover { background: #183f75; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    li { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #dc8600; outline-offset: 3px; }
    .create { display: flex; flex-wrap: wrap; gap: 10px; }
    .create input { flex: 1; min-width: 160px; }
    ul { padding: 0; list-style: none; margin-top: 28px; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce2e9; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    .task-completion { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: normal; }
    .task-filter { margin-top: 24px; }
    [role="alert"] { color: #a31b1b; margin: 16px 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', filter = 'Active', query = '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(query)}">`;
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      ${searchField}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="task-filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search projects</button>
    </form>
    <ul aria-label="Projects">${store.list(filter === 'Archived').filter((project) => matchesSearch(project.name, query)).map((project) => `
      <li data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get">
          <button type="submit">Open project</button>
        </form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
          ${searchField}
          <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
        </form>
      </li>`).join('')}</ul>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

// Applied ranges travel with forms and URLs, independently of unsaved range inputs.
function appliedDueRange(params) {
  try {
    return normalizeDueRange(params.get('dueFrom') || '', params.get('dueThrough') || '');
  } catch {
    return { from: '', through: '' };
  }
}

function dueRangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${range.from}">
    <input type="hidden" name="dueThrough" value="${range.through}">`;
}

function projectPage(project, filter = 'All', priority = 'All', error = '', range = { from: '', through: '' }, query = '') {
  const destinations = store.list().filter((destination) => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = store.listTasks(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    matchesDueRange(task.due_date, range) && matchesSearch(task.title, query));
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">
    ${dueRangeFields(range)}
    <input type="hidden" name="search" value="${escapeHtml(query)}">`;
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="create">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="create">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="search" value="${escapeHtml(query)}">
      ${dueRangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      ${filterFields}
      <input type="hidden" name="applyRange" value="1">
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${range.from}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${range.through}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${dueRangeFields(range)}
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <ul aria-label="Tasks">${tasks.map((task) => `
      <li data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          ${filterFields}
          <label class="task-completion">
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit">Save completion</button></noscript>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map((option) => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
          <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save priority</button></noscript>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="create">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destinationId"${moveDisabled ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </li>`).join('')}</ul>`);
}

function redirectToProject(response, projectId, filter, priority, range, search) {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (search) query.set('search', search);
  response.writeHead(303, { Location: `/projects/${projectId}?${query}` });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    // Applied filters and search are request-local view state, not saved data.
    let range = { from: '', through: '' };
    let search = (url.searchParams.get('search') || '').trim();
    const projectListLocation = (filter) => {
      const params = new URLSearchParams();
      if (filter !== 'Active') params.set('filter', filter);
      if (search) params.set('search', search);
      return params.size ? `/?${params}` : '/';
    };
    const readViewForm = async () => {
      const form = await readForm(request);
      search = (form.get('search') || '').trim();
      return form;
    };
    const renderProject = (project, filter, priority, error = '') =>
      projectPage(project, filter, priority, error, range, search);
    const redirectProject = (id, filter, priority) =>
      redirectToProject(response, id, filter, priority, range, search);
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && path === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter')), search));
      return;
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readViewForm();
      const filter = projectFilter(form.get('filter'));
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required', filter, search));
        return;
      }
      store.create(name);
      response.writeHead(303, { Location: projectListLocation(filter) });
      response.end();
      return;
    }
    const defaultPriorityMatch = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(path);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const id = Number(defaultPriorityMatch[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (project) {
        const form = await readViewForm();
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        range = appliedDueRange(form);
        if (project.archived) {
          sendHtml(response, 409, renderProject(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        const defaultPriority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(defaultPriority)) {
          sendHtml(response, 400, renderProject(project, filter, priority, 'Invalid task priority'));
          return;
        }
        store.setDefaultTaskPriority(id, defaultPriority);
        redirectProject(id, filter, priority);
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(path);
    if (request.method === 'POST' && renameMatch) {
      const id = Number(renameMatch[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (project) {
        const form = await readViewForm();
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        range = appliedDueRange(form);
        if (project.archived) {
          sendHtml(response, 409, renderProject(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, renderProject(project, filter, priority, 'Project name is required'));
          return;
        }
        store.rename(id, name);
        redirectProject(id, filter, priority);
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(path);
    if (request.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      await readViewForm();
      if (Number.isSafeInteger(id) && store.setArchived(id, archiveMatch[2] === 'archive')) {
        response.writeHead(303, { Location: projectListLocation(archiveMatch[2] === 'archive' ? 'Active' : 'Archived') });
        response.end();
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(path);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (project) {
        const filter = taskFilter(url.searchParams.get('filter'));
        const priority = priorityFilter(url.searchParams.get('priorityFilter'));
        range = appliedDueRange(url.searchParams);
        if (url.searchParams.get('applyRange') === '1') {
          try {
            range = normalizeDueRange(url.searchParams.get('rangeFrom') || '', url.searchParams.get('rangeThrough') || '');
          } catch (error) {
            sendHtml(response, 400, renderProject(project, filter, priority, error.message));
            return;
          }
          redirectProject(id, filter, priority);
          return;
        }
        sendHtml(response, 200, renderProject(project, filter, priority));
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date|move))?$/.exec(path);
    if (request.method === 'POST' && taskMatch) {
      const projectId = Number(taskMatch[1]);
      const project = Number.isSafeInteger(projectId) ? store.find(projectId) : undefined;
      if (project) {
        const form = await readViewForm();
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        range = appliedDueRange(form);
        if (project.archived) {
          sendHtml(response, 409, renderProject(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        if (!taskMatch[2]) {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, renderProject(project, filter, priority, 'Task title is required'));
            return;
          }
          store.createTask(projectId, title);
        } else {
          const taskId = Number(taskMatch[2]);
          let updated = false;
          if (Number.isSafeInteger(taskId)) {
            if (taskMatch[3] === 'move') {
              const destinationId = Number(form.get('destinationId'));
              updated = store.moveTask(projectId, taskId, destinationId);
              if (!updated) {
                sendHtml(response, 400, renderProject(project, filter, priority, 'Task must move to another active project'));
                return;
              }
            } else if (taskMatch[3] === 'rename') {
              const title = (form.get('title') || '').trim();
              if (!title) {
                sendHtml(response, 400, renderProject(project, filter, priority, 'Task title is required'));
                return;
              }
              updated = store.renameTask(projectId, taskId, title);
            } else if (taskMatch[3] === 'due-date') {
              try {
                updated = store.setTaskDueDate(projectId, taskId, form.get('dueDate') || '');
              } catch (error) {
                if (error.message !== 'Due date must be a valid YYYY-MM-DD date') throw error;
                sendHtml(response, 400, renderProject(project, filter, priority, error.message));
                return;
              }
            } else if (taskMatch[3] === 'priority') {
              const taskPriority = form.get('priority');
              if (!['Low', 'Normal', 'High'].includes(taskPriority)) {
                sendHtml(response, 400, renderProject(project, filter, priority, 'Invalid task priority'));
                return;
              }
              updated = store.setTaskPriority(projectId, taskId, taskPriority);
            } else {
              updated = store.setTaskCompleted(projectId, taskId, form.get('completed') === '1');
            }
          }
          if (!updated) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        }
        redirectProject(projectId, filter, priority);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    sendHtml(response, status, page('Error', `<h1>${status === 413 ? 'Request body is too large' : 'Something went wrong'}</h1>`));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
