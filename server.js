import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH ?? 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPath(projectId, filter) {
  return `/projects/${projectId}${filter === 'All' ? '' : `?filter=${filter}`}`;
}

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
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <header><p class="eyebrow">PROJECT WORKSPACE</p><h1>Workboard</h1></header>
    <section aria-labelledby="create-heading">
      <h2 id="create-heading">Create a project</h2>
      <form method="post" action="/projects" class="create-form">
        <div class="field"><label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autocomplete="off"></div>
        <button type="submit">Create project</button>
      </form>
      ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    </section>
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      ${projects.length ? `<div class="project-list">${projects.map(project => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit" class="secondary">Open project</button>
          </form>
        </div>`).join('')}</div>` : '<p class="muted">No projects yet. Create your first project above.</p>'}
    </section>`);
}

function projectPage(project, filter, error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <form method="get" action="/"><button class="secondary">Projects</button></form>
    <header><p class="eyebrow">PROJECT</p><h1>${escapeHtml(project.name)}</h1></header>
    <section aria-labelledby="create-task-heading">
      <h2 id="create-task-heading">Create a task</h2>
      <form method="post" action="/projects/${project.id}/tasks" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <div class="field"><label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text" autocomplete="off"></div>
        <button type="submit">Create task</button>
      </form>
      ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    </section>
    <section aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <form method="get" action="/projects/${project.id}">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${tasks.length ? tasks.map(task => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <input type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
              onchange="this.form.requestSubmit()">
          </form>
        </div>`).join('') : '<p class="muted">No tasks to show.</p>'}
    </section>`);
}

async function readForm(request) {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/styles.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(styles);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      addProject.run(name);
      redirect(response, '/');
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskRoute) {
      const project = findProject.get(taskRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        if (taskRoute[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskRoute[2], project.id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          addTask.run(project.id, title);
        }
        redirect(response, projectPath(project.id, filter));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1><a href="/">Projects</a>'));
  }
});

const styles = `
  :root { font-family: system-ui, sans-serif; color: #172c35; background: #f4f7f8; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  main { max-width: 860px; margin: 64px auto; padding: 0 24px; }
  header { margin: 32px 0; }
  .eyebrow { color: #526970; font-size: .75rem; font-weight: 700; letter-spacing: .15em; }
  h1 { font-size: 2.5rem; margin: 8px 0; overflow-wrap: anywhere; }
  h2 { font-size: 1.1rem; margin: 0 0 20px; }
  section { padding: 28px; background: white; border: 1px solid #dce5e8; border-radius: 12px; margin-bottom: 24px; }
  .create-form { display: flex; align-items: end; gap: 16px; }
  .field { flex: 1; }
  label { display: block; font-weight: 600; font-size: .9rem; margin-bottom: 8px; }
  input[type="text"], select { width: 100%; border: 1px solid #8a9ca3; border-radius: 6px; padding: 12px; font: inherit; }
  select { margin-bottom: 16px; }
  input[type="checkbox"] { width: 22px; height: 22px; cursor: pointer; accent-color: #176659; }
  button { border: 1px solid #176659; border-radius: 6px; padding: 12px 18px; background: #176659; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #104e44; }
  button.secondary { background: white; color: #176659; }
  button.secondary:hover { background: #edf6f3; }
  :focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
  .project-row, .task-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 16px 0; border-top: 1px solid #dce5e8; }
  .project-row span, .task-row span { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
  .project-row form, .task-row form { flex-shrink: 0; }
  .alert { color: #a12626; }
  .muted { color: #526970; }
  @media (max-width: 560px) { main { margin-top: 32px; padding: 0 16px; } section { padding: 20px; } .create-form { align-items: stretch; flex-direction: column; } }
`;

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
