import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
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
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #18243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dfe5ee; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 12px; border: 1px solid #8493aa; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; background: #244dc2; color: white; border: 0; border-radius: 6px; font: inherit; cursor: pointer; }
    input:focus-visible, button:focus-visible, select:focus-visible { outline: 3px solid #e99513; outline-offset: 3px; }
    select { padding: 10px; font: inherit; }
    .filter { margin-top: 24px; }
    .task { padding: 16px 0; border-top: 1px solid #dfe5ee; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: normal; }
    .task input { width: auto; flex-shrink: 0; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 32px; }
    .project { display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dfe5ee; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a11924; background: #fff0f1; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
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
      ${projects.length ? projects.map((project) => `
        <div class="project" data-testid="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p>No projects yet.</p>'}
    </section>`);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
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
        ${['All', 'Open', 'Completed'].map((value) => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map((task) => `
        <div class="task" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <label>
              <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
        </div>`).join('')}
    </section>`);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
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
      html(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, Number(taskId), id);
        if (!result.changes) {
          html(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(id, title);
      }
      response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
      response.end();
    } else {
      html(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    html(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
