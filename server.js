import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(title) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
// Migrate existing project databases without replacing their IDs or tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #18243b; font: 17px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input[type="checkbox"] { width: auto; }
    select { padding: 8px; font: inherit; }
    .tasks { margin-top: 24px; }
    .task { padding: 16px 0; border-top: 1px solid #dde3ed; }
    .task label { display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    input { width: 100%; padding: 12px; border: 1px solid #7c899f; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244fc3; color: white; cursor: pointer; font: inherit; }
    button:hover { background: #193990; }
    button:disabled { background: #778195; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #c57500; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 32px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dde3ed; }
    .project span { min-width: 0; overflow-wrap: anywhere; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a21c25; margin: 12px 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <input type="hidden" name="filter" value="${filter}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      <form method="get" action="/">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <noscript><button type="submit">Apply filter</button></noscript>
      </form>
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </div>`).join('')}
    </section>`);
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <input type="hidden" name="filter" value="${filter}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <section class="tasks" aria-label="Tasks">
      <form method="get" action="/projects/${project.id}">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <noscript><button type="submit">Apply filter</button></noscript>
      </form>
      ${tasks.map((task) => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
          <noscript><button type="submit">Save completion</button></noscript>
        </form>
      </div>`).join('')}
    </section>`);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    const projectRoute = pathname.match(/^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*))?)?$/);
    const archiveRoute = pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(searchParams.get('filter'))));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 422, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
    } else if (request.method === 'POST' && archiveRoute) {
      const id = Number(archiveRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      setProjectArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, id);
      redirect(response, archiveRoute[2] === 'restore' ? '/?filter=Archived' : '/');
    } else if (projectRoute && (request.method === 'GET' && !pathname.includes('/tasks') || request.method === 'POST' && pathname.includes('/tasks'))) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      if (request.method === 'GET') {
        html(response, 200, projectPage(project, taskFilter(searchParams.get('filter'))));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project is read-only'));
        return;
      }
      if (projectRoute[2]) {
        const taskId = Number(projectRoute[2]);
        const result = Number.isSafeInteger(taskId)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id)
          : { changes: 0 };
        if (!result.changes) {
          html(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 422, projectPage(project, filter, 'Task title is required'));
          return;
        }
        insertTask.run(id, title);
      }
      redirect(response, `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}`);
    } else {
      html(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    if (!error.status) console.error(error);
    html(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
