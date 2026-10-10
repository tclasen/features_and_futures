import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id ASC`);

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
    body { margin: 0; background: #f4f6fa; color: #19253b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 16px; }
    h1 { margin: 0 0 24px; font-size: 32px; overflow-wrap: anywhere; }
    h2 { margin-top: 32px; font-size: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8a98ad; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 11px 16px; background: #254ec4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193a9c; }
    button:disabled { background: #788398; cursor: default; }
    :focus-visible { outline: 3px solid #bc6a00; outline-offset: 3px; }
    select { font: inherit; padding: 8px; border: 1px solid #8a98ad; border-radius: 6px; }
    .task-row { padding: 16px 0; border-top: 1px solid #dde3ed; overflow-wrap: anywhere; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task-row input { flex: none; width: 20px; height: 20px; }
    .filter { margin: 24px 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dde3ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    [role="alert"] { color: #a32121; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #59687e; }
    @media (max-width: 540px) { main { margin: 16px; padding: 20px; } .create, .project-row { flex-direction: column; align-items: stretch; } }
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
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <section aria-labelledby="projects-heading"><h2 id="projects-heading">Projects</h2>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
      <div class="project-name"><span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span></div>
      <div class="project-actions">
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      <form method="post" action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}">
        <button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button>
      </form></div>
    </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <section aria-labelledby="tasks-heading"><h2 id="tasks-heading">Tasks</h2>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? tasks.map(task => `<div class="task-row" data-testid="task-row">
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="completed" value="0">
        <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
    </div>`).join('') : '<p class="empty">No matching tasks.</p>'}
    </section>`);
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      if (!body) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = body.get('name')?.trim() || '';
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required', projectFilter(body.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && getProject.get(id)) {
        setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const projectId = Number(taskMatch[1]);
      const taskId = taskMatch[2] ? Number(taskMatch[2]) : null;
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (project && (taskId === null || Number.isSafeInteger(taskId))) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only'));
          return;
        }
        if (taskId === null) {
          const title = body.get('title')?.trim() || '';
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(projectId, title);
        } else {
          const completed = body.getAll('completed').at(-1) === '1' ? 1 : 0;
          if (!updateTask.run(completed, taskId, projectId).changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, `/projects/${projectId}?filter=${filter}`);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
