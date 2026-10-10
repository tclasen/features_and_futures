import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #1c293d; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { padding: 10px; border: 1px solid #798496; border-radius: 5px; font: inherit; width: 100%; }
    button { padding: 10px 16px; border: 0; border-radius: 5px; background: #244ecb; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #193aa0; }
    :focus-visible { outline: 3px solid #e99500; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks { margin-top: 30px; }
    .task { border-top: 1px solid #dce1e9; padding: 16px 0; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; }
    input[type="checkbox"] { width: auto; flex-shrink: 0; }
    .filter { margin-top: 24px; }
    select { padding: 8px; font: inherit; }
    .create { margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce1e9; padding: 16px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a21d26; margin: 14px 0; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map(project => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit">Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="tasks" aria-label="Tasks">
      ${tasks.map(task => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </div>`).join('')}
    </section>`);
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
      const error = new Error('Request is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 200, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (parts[4]) {
        const taskId = Number(parts[4]);
        const result = Number.isSafeInteger(taskId)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId)
          : { changes: 0 };
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 200, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(projectId, title);
      }
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
