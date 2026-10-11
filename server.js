import { createServer } from 'node:http';
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
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id
  ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const taskFilters = ['All', 'Open', 'Completed'];
const projectFilters = ['Active', 'Archived'];

function normalizeFilter(value) {
  return taskFilters.includes(value) ? value : 'All';
}

function projectLocation(id, filter) {
  return `/projects/${id}${filter === 'All' ? '' : `?filter=${encodeURIComponent(filter)}`}`;
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #182334; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    h2 { margin: 32px 0 12px; font-size: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; padding: 10px 12px; border: 1px solid #8894a6; border-radius: 6px; font: inherit; }
    input[type="checkbox"] { min-width: auto; width: 20px; height: 20px; margin: 0; cursor: pointer; }
    select { padding: 8px; font: inherit; }
    .task-create { margin-top: 24px; }
    .filter { margin-bottom: 16px; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #2855b5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d418e; }
    button:disabled, input:disabled { cursor: not-allowed; opacity: 0.6; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #e09320; outline-offset: 3px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dde3ec; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a62222; }
    .empty { color: #5b6675; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } li { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Projects</h2>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${projectFilters.map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    ${projects.length ? `<ul>${projects.map(project => `
      <li data-testid="project-row"><div><span>${escapeHtml(project.name)}</span>
        <div data-testid="project-summary">${project.completed_count}/${project.total_count} completed</div></div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </li>`).join('')}</ul>` : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet.'}</p>`}`);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="task-create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Tasks</h2>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${taskFilters.map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `
      <li data-testid="task-row"><span>${escapeHtml(task.title)}</span>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save completion</button></noscript>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}`);
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
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      const filter = projectFilters.includes(url.searchParams.get('filter')) ? url.searchParams.get('filter') : 'Active';
      sendHtml(response, 200, projectsPage('', filter));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        const filter = projectFilters.includes(form.get('filter')) ? form.get('filter') : 'Active';
        sendHtml(response, 400, projectsPage('Project name is required', filter));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
    } else if (/^\/projects\/[1-9]\d*(?:\/(?:archive|restore|tasks(?:\/[1-9]\d*\/completion)?))?$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      if (request.method === 'GET' && url.pathname === `/projects/${id}`) {
        sendHtml(response, 200, projectPage(project, normalizeFilter(url.searchParams.get('filter'))));
      } else if (request.method === 'POST' && (url.pathname === `/projects/${id}/archive` || url.pathname === `/projects/${id}/restore`)) {
        const archived = url.pathname.endsWith('/archive');
        updateProjectArchive.run(archived ? 1 : 0, id);
        redirect(response, archived ? '/' : '/?filter=Archived');
      } else if (request.method === 'POST' && url.pathname === `/projects/${id}/tasks`) {
        const form = await readForm(request);
        const currentProject = findProject.get(id);
        if (currentProject.archived) {
          sendHtml(response, 409, projectPage(currentProject, normalizeFilter(form.get('filter')), 'Archived project'));
          return;
        }
        const title = (form.get('title') || '').trim();
        const filter = normalizeFilter(form.get('filter'));
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        insertTask.run(id, title);
        redirect(response, projectLocation(id, filter));
      } else if (request.method === 'POST' && url.pathname.endsWith('/completion')) {
        const taskId = Number(url.pathname.split('/')[4]);
        const form = await readForm(request);
        const currentProject = findProject.get(id);
        if (currentProject.archived) {
          sendHtml(response, 409, projectPage(currentProject, normalizeFilter(form.get('filter')), 'Archived project'));
          return;
        }
        const result = Number.isSafeInteger(taskId)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id)
          : { changes: 0 };
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        redirect(response, projectLocation(id, normalizeFilter(form.get('filter'))));
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
      }
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
    }
  } catch (error) {
    if (!error.status) console.error(error);
    sendHtml(response, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
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
