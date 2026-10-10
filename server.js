import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const projectFilter = value => value === 'Archived' ? 'Archived' : 'Active';
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const taskFilter = value => ['All', 'Open', 'Completed'].includes(value) ? value : 'All';

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17263d; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input { font: inherit; padding: 10px 12px; border: 1px solid #8593a8; border-radius: 6px; width: 100%; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 6px; padding: 10px 16px; color: white; background: #2459b8; }
    button:disabled, input:disabled { cursor: not-allowed; opacity: .6; }
    button:hover { background: #18438f; }
    :focus-visible { outline: 3px solid #db8c12; outline-offset: 3px; }
    .create { display: grid; gap: 12px; margin-bottom: 32px; }
    .create button { justify-self: start; }
    .project { display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dce2eb; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .navigation { margin-bottom: 24px; }
    select { font: inherit; padding: 8px 12px; margin-bottom: 16px; }
    .task { display: flex; gap: 12px; align-items: center; padding: 16px 0; border-top: 1px solid #dce2eb; }
    .task input { width: 20px; height: 20px; margin: 0; cursor: pointer; }
    .task span { overflow-wrap: anywhere; min-width: 0; }
    [role="alert"] { color: #a32323; margin: 0 0 16px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div>
      <button type="submit">Create project</button>
    </form>
    <form action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects">${listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
      <div class="project" data-testid="project-row">
        <span>${escape(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}" method="post">
          <button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}</section>`);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(`<h1>${escape(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="navigation" action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <div><label for="task-title">Task title</label><input id="task-title" name="title" type="text"></div>
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">${tasks.map(task => `
      <form class="task" data-testid="task-row" action="/projects/${project.id}/tasks/${task.id}" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        <span>${escape(task.title)}</span>
      </form>`).join('')}</section>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 200, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(pathname)) {
      const [, , projectId, action] = pathname.split('/');
      const id = Number(projectId);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, id);
      redirect(response, action === 'archive' ? '/' : '/?filter=Archived');
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*)?$/.test(pathname)) {
      const [, , projectId, , taskId] = pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        return;
      }
      if (taskId) {
        const task = Number(taskId);
        if (!Number.isSafeInteger(task) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, task, id).changes) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 200, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(id, title);
      }
      redirect(response, `/projects/${id}?filter=${filter}`);
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
      } else {
        html(response, 404, page('<h1>Project not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>'));
      }
    } else {
      html(response, 404, page('<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Unable to complete request</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
