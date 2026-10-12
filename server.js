import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
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
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const rows = listProjects.all().map((project) => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Projects</h2>
    ${rows ? `<ul class="projects">${rows}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

function projectPage(project, filter = 'All', error = '') {
  const path = `/projects/${project.id}`;
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  const rows = tasks.map((task) => `
    <li data-testid="task-row">
      <span>${escapeHtml(task.title)}</span>
      <form action="${path}/tasks/${task.id}/completion" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <input type="checkbox" name="completed" value="1"
          aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''} data-auto-submit>
      </form>
    </li>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h2>Tasks</h2>
    <form action="${path}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="input-group">
        <input id="task-title" name="title" type="text">
        <button type="submit">Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="${path}" method="get" class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-auto-submit>
        ${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${rows ? `<ul class="projects">${rows}</ul>` : '<p class="empty">No matching tasks.</p>'}
  `);
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
    if (size > 1024 * 1024) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #192b3b; background: #f3f6f9; }
  * { box-sizing: border-box; }
  main { max-width: 760px; margin: 48px auto; padding: 32px; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .input-group { display: flex; gap: 12px; flex-wrap: wrap; }
  input { flex: 1; min-width: 160px; padding: 10px; border: 1px solid #748595; border-radius: 5px; font: inherit; }
  button { padding: 10px 16px; border: 0; border-radius: 5px; background: #165fc1; color: white; font: inherit; cursor: pointer; }
  button:hover { background: #10478f; }
  input[type=checkbox] { min-width: auto; width: 22px; height: 22px; cursor: pointer; }
  select { padding: 10px; font: inherit; }
  .task-filter { margin-top: 24px; }
  :focus-visible { outline: 3px solid #d77b00; outline-offset: 3px; }
  .projects { padding: 0; list-style: none; }
  .projects li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #dce3ea; }
  .projects span { overflow-wrap: anywhere; min-width: 0; }
  .projects form { flex-shrink: 0; }
  [role=alert] { color: #a01818; }
  .empty { color: #536574; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(stylesheet);
    } else if (request.method === 'GET' && url.pathname === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(`document.addEventListener('change', (event) => {
        if (event.target.matches('[data-auto-submit]')) event.target.form.requestSubmit();
      });`);
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
      } else {
        createProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      }
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/completion)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const taskNumber = Number(taskId);
        const result = Number.isSafeInteger(taskNumber)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskNumber, id)
          : { changes: 0 };
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(id, title);
      }
      response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent && !response.destroyed) {
      sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
