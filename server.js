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
const projectTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const allProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #18263b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 8px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin: 32px 0 12px; }
    .intro, .empty { color: #536278; }
    form.create { background: white; padding: 24px; border: 1px solid #d7dfe9; border-radius: 12px; margin-top: 28px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 11px 12px; border: 1px solid #8795a8; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 1px solid #224fc5; border-radius: 6px; background: #224fc5; color: white; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    button:hover { background: #183c9c; }
    :focus-visible { outline: 3px solid #b66600; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: white; border: 1px solid #d7dfe9; padding: 20px; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a21b20; margin: 12px 0 0; }
    select { padding: 10px; font: inherit; border: 1px solid #8795a8; border-radius: 6px; }
    .filter { margin: 24px 0 16px; }
    .task { background: white; border: 1px solid #d7dfe9; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input { flex: none; width: 20px; height: 20px; }
    .back { margin-bottom: 24px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .controls { flex-direction: column; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main>
<script>
  const form = document.querySelector('.create');
  if (form) form.addEventListener('submit', event => {
    const input = form.querySelector('input');
    if (!input.value.trim()) {
      event.preventDefault();
      document.getElementById(input.getAttribute('aria-describedby')).textContent = form.dataset.required;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });
  const pendingSaves = new Set();
  document.querySelectorAll('.task input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', () => {
      const completed = input.checked;
      const body = new URLSearchParams(new FormData(input.form));
      body.set('completed', completed ? '1' : '0');
      input.disabled = true;
      const save = (async () => {
        try {
          const response = await fetch(input.form.action, {
            method: 'POST', body, headers: { Accept: 'application/json' }, keepalive: true,
          });
          if (!response.ok) throw new Error('Completion could not be saved');
          const filter = document.getElementById('task-filter');
          if (filter.value !== 'All' && completed !== (filter.value === 'Completed')) {
            input.closest('.task').remove();
          }
          document.getElementById('completion-error').textContent = '';
        } catch {
          input.checked = !completed;
          document.getElementById('completion-error').textContent = 'Task completion could not be saved. Please try again.';
        } finally {
          input.disabled = false;
        }
      })();
      pendingSaves.add(save);
      save.finally(() => pendingSaves.delete(save));
    });
  });
  const filter = document.getElementById('task-filter');
  if (filter) filter.addEventListener('change', async () => {
    await Promise.all(pendingSaves);
    filter.form.requestSubmit();
  });
</script>
</body></html>`;
}

function projectsPage(error = '', name = '') {
  const projects = allProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form class="create" data-required="Project name is required" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="controls"><input id="project-name" name="name" value="${escapeHtml(name)}" aria-describedby="project-error"${error ? ' aria-invalid="true"' : ''}>
      <button type="submit">Create project</button></div>
      <p id="project-error" role="alert">${escapeHtml(error)}</p>
    </form>
    <h2>Projects</h2>
    <div class="projects">${projects.map(project => `<div class="project" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`).join('')}</div>
    ${projects.length ? '' : '<p class="empty">No projects yet. Create your first project above.</p>'}`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = projectTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <form class="create" data-required="Task title is required" method="post" action="/projects/${project.id}/tasks">
      <label for="task-title">Task title</label>
      <div class="controls"><input id="task-title" name="title" aria-describedby="task-error"${error ? ' aria-invalid="true"' : ''}>
      <button type="submit">Create task</button></div>
      <input type="hidden" name="filter" value="${filter}">
      <p id="task-error" role="alert">${escapeHtml(error)}</p>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">${['All', 'Open', 'Completed'].map(value =>
        `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}</select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <p id="completion-error" role="alert"></p>
    <div class="tasks">${tasks.map(task => `<div class="task" data-testid="task-row">
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml('Complete ' + task.title)}"${task.completed ? ' checked' : ''}><span>${escapeHtml(task.title)}</span></label>
        <input type="hidden" name="filter" value="${filter}">
        <noscript><button type="submit">Save completion</button></noscript>
      </form>
    </div>`).join('')}</div>
    ${tasks.length ? '' : '<p class="empty">No tasks match this filter.</p>'}`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
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
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = findProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        if (!result.changes) {
          sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
        if (request.headers.accept === 'application/json') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ completed: form.get('completed') === '1' }));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(projectId, title);
      }
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Page not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
