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
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f5f7fa; color: #17243a; margin: 0; }
    main { max-width: 760px; margin: 48px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input, select, button { font: inherit; border-radius: 6px; padding: 10px 14px; }
    input { border: 1px solid #68758a; max-width: 100%; box-sizing: border-box; }
    button { background: #244eab; color: white; border: 1px solid #244eab; cursor: pointer; }
    button:hover { background: #183b87; }
    :focus-visible { outline: 3px solid #ae6500; outline-offset: 3px; }
    .create { display: flex; flex-wrap: wrap; gap: 12px; }
    .projects { padding: 0; list-style: none; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px; margin: 12px 0; background: white; border: 1px solid #d0d7e2; border-radius: 8px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a01919; font-weight: 600; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    ${projects.length ? `<ul class="projects">${projects.map(project => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p>No projects yet.</p>'}`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h2>Tasks</h2>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text">
      <button type="submit">Create task</button></div>
    </form>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <ul class="projects">${tasks.map(task => `<li class="project" data-testid="task-row">
      <span>${escapeHtml(task.title)}</span>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
        <noscript><button type="submit">Save completion</button></noscript>
      </form>
    </li>`).join('')}</ul>`);
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectsPage());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      if (!form) {
        html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(res, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (req.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Not found</h1>'));
        return;
      }
      const form = await readForm(req);
      if (!form) {
        html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      if (taskMatch[2]) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
        if (!result.changes) {
          html(res, 404, page('Not found', '<h1>Not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(project.id, title);
      }
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      res.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    html(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
