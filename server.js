import { createServer } from 'node:http';
import { openProjectStore } from './projects.js';

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

function projectList(error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <ul aria-label="Projects">${store.list().map((project) => `
      <li data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get">
          <button type="submit">Open project</button>
        </form>
      </li>`).join('')}</ul>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = store.listTasks(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <ul aria-label="Tasks">${tasks.map((task) => `
      <li data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
          <label class="task-completion">
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit">Save completion</button></noscript>
        </form>
      </li>`).join('')}</ul>`);
}

function redirectToProject(response, projectId, filter) {
  response.writeHead(303, { Location: `/projects/${projectId}?filter=${encodeURIComponent(filter)}` });
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
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && path === '/') {
      sendHtml(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      store.create(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(path);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? store.find(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/completion)?$/.exec(path);
    if (request.method === 'POST' && taskMatch) {
      const projectId = Number(taskMatch[1]);
      const project = Number.isSafeInteger(projectId) ? store.find(projectId) : undefined;
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (!taskMatch[2]) {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          store.createTask(projectId, title);
        } else {
          const taskId = Number(taskMatch[2]);
          if (!Number.isSafeInteger(taskId) || !store.setTaskCompleted(projectId, taskId, form.get('completed') === '1')) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        }
        redirectToProject(response, projectId, filter);
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
