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
)`);
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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17243a; font: 17px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 3px 18px #17243a12; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input[type="checkbox"] { width: auto; }
    select { padding: 10px; font: inherit; }
    .task-row { display: flex; align-items: center; gap: 12px; border-top: 1px solid #dce2ec; padding: 18px 0; overflow-wrap: anywhere; }
    .task-row label { margin: 0; }
    .filter { margin: 24px 0; }
    input { padding: 11px; border: 1px solid #8895a7; border-radius: 5px; font: inherit; width: 100%; }
    button { padding: 11px 16px; border: 0; border-radius: 5px; background: #2457b8; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #183e86; }
    :focus-visible { outline: 3px solid #e69b25; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce2ec; padding: 18px 0; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row button { white-space: nowrap; }
    .projects { margin-top: 30px; }
    [role="alert"] { color: #a12424; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', value = '') {
  const rows = listProjects.all().map(project => `
    <div class="project-row" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" value="${escapeHtml(value)}" autocomplete="off">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const rows = listTasks.all(project.id)
    .filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
    .map(task => `
      <div class="task-row" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input id="task-${task.id}" type="checkbox" name="completed" value="1"
            aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''}
            onchange="this.form.requestSubmit()">
        </form>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" autocomplete="off">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">${rows}</section>`);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = new URLSearchParams(await readBody(request));
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        }
        redirect(response, `/projects/${project.id}?filter=${filter}`);
        return;
      }
    }
    const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
