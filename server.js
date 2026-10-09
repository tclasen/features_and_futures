import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
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
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6fa; color: #172338; }
    main { max-width: 760px; margin: 48px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    form { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
    label { display: grid; gap: 6px; flex: 1; min-width: 180px; font-weight: 600; }
    input, select, button { font: inherit; border-radius: 6px; padding: 10px 14px; }
    input { width: 100%; border: 1px solid #68768b; background: white; }
    button { border: 1px solid #224ea0; background: #224ea0; color: white; cursor: pointer; }
    :focus-visible { outline: 3px solid #c06400; outline-offset: 3px; }
    ul { list-style: none; padding: 0; margin-top: 24px; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; margin: 12px 0; background: white; border: 1px solid #cbd2de; border-radius: 8px; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    input[type="checkbox"] { width: auto; }
    .task-label { display: flex; align-items: center; min-width: 0; overflow-wrap: anywhere; }
    [role="alert"] { color: #9e1c1c; font-weight: 600; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function html(response, status, title, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(page(title, content));
}

function projectsPage(response, error = '') {
  const projects = listProjects.all();
  html(response, 200, 'Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name<input id="project-name" name="name" type="text"></label>
      <button type="submit">Create project</button>
    </form>
    <ul aria-label="Projects">${projects.map(project => `
      <li data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>
    ${projects.length ? '' : '<p>No projects yet.</p>'}`);
}

function taskFilter(value) {
  return ['all', 'open', 'completed'].includes(value) ? value : 'all';
}

function projectPage(response, project, filter = 'all', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'all' || Boolean(task.completed) === (filter === 'completed'));
  const path = `/projects/${project.id}`;
  html(response, 200, project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="${path}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title<input id="task-title" name="title" type="text"></label>
      <button type="submit">Create task</button>
    </form>
    <form method="get" action="${path}">
      <label for="task-filter">Task filter
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) =>
            `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <ul aria-label="Tasks">${tasks.map(task => `
      <li data-testid="task-row">
        <form method="post" action="${path}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label class="task-label">
            <input type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
              onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit">Save completion</button></noscript>
        </form>
      </li>`).join('')}</ul>
    ${tasks.length ? '' : '<p>No matching tasks.</p>'}`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      projectsPage(response);
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        projectsPage(response, 'Project name is required');
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = getProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        html(response, 404, 'Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>');
        return;
      }
      projectPage(response, project, taskFilter(url.searchParams.get('filter')));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = getProject.get(Number(projectId));
      if (!project) {
        html(response, 404, 'Not found', '<h1>Project not found</h1>');
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, Number(taskId), project.id);
        if (!result.changes) {
          html(response, 404, 'Not found', '<h1>Task not found</h1>');
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          projectPage(response, project, filter, 'Task title is required');
          return;
        }
        createTask.run(project.id, title);
      }
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else {
      html(response, 404, 'Not found', '<h1>Page not found</h1>');
    }
  } catch (error) {
    console.error(error);
    html(response, error.status || 500, 'Error', '<h1>Unable to process request</h1>');
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
