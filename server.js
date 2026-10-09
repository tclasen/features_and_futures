import { createServer } from 'node:http';
import { openProjects } from './projects.js';

const projects = openProjects(process.env.DB_PATH || 'data/workboard.sqlite');
const port = Number(process.env.PORT || 8080);

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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172b40; background: #f3f6fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 32px #172b4010; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8192a5; border-radius: 6px; padding: 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 18px; background: #205bc4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #17489e; }
    button:disabled { background: #8192a5; cursor: default; }
    :focus-visible { outline: 3px solid #dc8b00; outline-offset: 3px; }
    [role="alert"] { color: #a02020; margin: 16px 0; }
    .projects { margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce3ec; padding: 18px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .task { display: flex; align-items: center; gap: 12px; border-top: 1px solid #dce3ec; padding: 18px 0; overflow-wrap: anywhere; }
    .task input { flex: none; width: 20px; height: 20px; }
    .task label { margin: 0; font-weight: 400; min-width: 0; }
    .task-controls { margin-top: 28px; }
    select { padding: 10px; font: inherit; border: 1px solid #8192a5; border-radius: 6px; }
    .empty { color: #536578; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } .create { flex-direction: column; } .project { flex-wrap: wrap; } .project > div { width: 100%; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

const projectFilters = ['Active', 'Archived'];

function normalizeProjectFilter(value) {
  return projectFilters.includes(value) ? value : 'Active';
}

function projectList(error = '', filter = 'Active') {
  const rows = projects.list(filter === 'Archived').map((project) => `
    <div class="project" data-testid="project-row">
      <div><span>${escapeHtml(project.name)}</span>
        <p data-testid="project-summary">${project.completed_count}/${project.total_count} completed</p></div>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-controls" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${projectFilters.map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">${rows || '<p class="empty">No projects yet.</p>'}</div>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

const taskFilters = ['All', 'Open', 'Completed'];

function normalizeFilter(value) {
  return taskFilters.includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const rows = projects.listTasks(project.id)
    .filter((task) => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
    .map((task) => `<form class="task" data-testid="task-row" action="/projects/${project.id}/tasks/${task.id}" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input id="task-${task.id}" type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()">
      <label for="task-${task.id}">${escapeHtml(task.title)}</label>
    </form>`).join('');
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form class="task-controls" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-controls" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${taskFilters.map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="tasks">${rows || '<p class="empty">No matching tasks.</p>'}</div>`);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

const server = createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList('', normalizeProjectFilter(searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const body = await readForm(request);
      if (!body) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const project = projects.create(body.get('name'));
      if (!project) {
        sendHtml(response, 422, projectList('Project name is required'));
        return;
      }
      redirect(response, '/');
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? projects.find(id) : null;
      if (project) {
        sendHtml(response, 200, projectPage(project, normalizeFilter(searchParams.get('filter'))));
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(pathname);
    if (request.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && projects.setArchived(id, archiveMatch[2] === 'archive')) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(pathname);
    if (request.method === 'POST' && taskMatch) {
      const projectId = Number(taskMatch[1]);
      const taskId = taskMatch[2] ? Number(taskMatch[2]) : null;
      const project = Number.isSafeInteger(projectId) ? projects.find(projectId) : null;
      if (project && (taskId === null || Number.isSafeInteger(taskId))) {
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, normalizeFilter(searchParams.get('filter')), 'Archived project is read-only'));
          return;
        }
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = normalizeFilter(body.get('filter'));
        if (taskId === null) {
          if (!projects.createTask(projectId, body.get('title'))) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
        } else if (!projects.setTaskCompleted(projectId, taskId, body.get('completed') === '1')) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        redirect(response, `/projects/${projectId}?filter=${filter}`);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Unable to complete your request</h1>'));
    else response.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));

function shutdown() {
  server.close(() => {
    projects.close();
    process.exit(0);
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
