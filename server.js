import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
    :root { font-family: system-ui, sans-serif; color: #18293a; background: #f4f6f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 12px 0 32px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin-top: 36px; }
    .eyebrow { color: #52657a; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
    .create-form { padding: 24px; background: white; border: 1px solid #dce3eb; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 10px; }
    .controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 12px; border: 1px solid #94a3b8; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 1px solid #2456ae; border-radius: 6px; background: #2456ae; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1b438c; }
    button:disabled { background: #64748b; border-color: #64748b; cursor: default; }
    :focus-visible { outline: 3px solid #e99d27; outline-offset: 3px; }
    [role="alert"] { color: #a22424; margin: 0 0 16px; }
    .project-list { list-style: none; padding: 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; margin-bottom: 12px; background: white; border: 1px solid #dce3eb; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-summary { display: block; margin-top: 6px; color: #52657a; font-size: 14px; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .project-row form { flex-shrink: 0; }
    .empty { color: #52657a; }
    select { padding: 10px; border: 1px solid #94a3b8; border-radius: 6px; background: white; font: inherit; }
    .task-list { list-style: none; padding: 0; }
    .task-row { padding: 18px 20px; margin-bottom: 12px; background: white; border: 1px solid #dce3eb; border-radius: 10px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input { flex: none; }
    .task-title { min-width: 0; }
    @media (max-width: 520px) { main { margin-top: 32px; } .controls { flex-direction: column; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <p class="eyebrow">Your workspace</p>
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects?filter=${filter}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul class="project-list">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <span class="project-summary" data-testid="project-summary">${project.completed}/${project.total} completed</span>
        </div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
        </div>
      </li>`).join('')}</ul>` : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create a project to get started.'}</p>`}
  `);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  const action = `/projects/${project.id}`;
  const query = new URLSearchParams({ filter }).toString();
  return page(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create-form" method="post" action="${action}/rename?${query}">
      <label for="new-project-name">New project name</label>
      <div class="controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="create-form" method="post" action="${action}/tasks?${query}">
      <label for="task-title">Task title</label>
      <div class="controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form method="get" action="${action}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul class="task-list">${tasks.map(task => `
      <li class="task-row" data-testid="task-row">
        <form method="post" action="${action}/tasks/${task.id}?${query}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span class="task-title">${escapeHtml(task.title)}</span></label>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

async function readForm(request) {
  const chunks = [];
  let bodySize = 0;
  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > 1_048_576) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      const name = (body.get('name') ?? '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      if (!Number.isSafeInteger(id) || !setProjectArchived.run(url.pathname.endsWith('/archive') ? 1 : 0, id).changes) {
        html(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      redirect(response, url.pathname.endsWith('/restore') ? '/?filter=Archived' : '/');
    } else if ((request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) ||
      (request.method === 'POST' && /^\/projects\/\d+\/(?:rename|tasks(?:\/\d+)?)$/.test(url.pathname))) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      const requestedFilter = url.searchParams.get('filter');
      const filter = ['Open', 'Completed'].includes(requestedFilter) ? requestedFilter : 'All';
      if (request.method === 'GET') {
        html(response, 200, projectPage(project, filter));
      } else {
        const body = await readForm(request);
        const currentProject = getProject.get(project.id);
        if (currentProject.archived) {
          html(response, 403, projectPage(currentProject, filter, 'Archived project'));
          return;
        }
        const taskId = url.pathname.split('/')[4];
        if (url.pathname.endsWith('/rename')) {
          const name = (body.get('name') ?? '').trim();
          if (!name) {
            html(response, 400, projectPage(currentProject, filter, 'Project name is required'));
            return;
          }
          renameProject.run(name, project.id);
        } else if (taskId === undefined) {
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        } else {
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !updateTask.run(body.get('completed') === '1' ? 1 : 0, id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, `/projects/${project.id}?${new URLSearchParams({ filter })}`);
      }
    } else {
      html(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(response, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!response.headersSent) html(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
