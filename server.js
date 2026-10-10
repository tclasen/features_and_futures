import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #18283c; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    .brand { color: #52647d; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-size: 36px; margin: 12px 0 28px; overflow-wrap: anywhere; }
    .panel { padding: 24px; border: 1px solid #dce3ed; border-radius: 14px; background: white; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; font: inherit; padding: 12px; border: 1px solid #aab7c8; border-radius: 7px; }
    button { font: inherit; font-weight: 600; cursor: pointer; padding: 12px 18px; border: 1px solid #254dc4; border-radius: 7px; background: #254dc4; color: white; }
    button:hover { background: #19399b; }
    button:disabled { background: #dce3ed; color: #52647d; border-color: #aab7c8; cursor: default; }
    :focus-visible { outline: 3px solid #e69422; outline-offset: 3px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { font-size: 18px; font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .summary { color: #52647d; margin-top: 8px; font-size: 14px; }
    .task-create { margin-top: 24px; }
    .filter { margin-top: 24px; }
    select { font: inherit; padding: 10px; border: 1px solid #aab7c8; border-radius: 7px; background: white; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input { flex: none; width: 20px; height: 20px; }
    .task-row.completed span { text-decoration: line-through; color: #52647d; }
    .secondary { background: white; color: #254dc4; }
    .secondary:hover { background: #eef2ff; }
    .empty { color: #52647d; text-align: center; padding: 24px; }
    [role="alert"] { color: #9e2424; background: #fff1f1; padding: 12px; border-radius: 7px; margin-bottom: 16px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields { flex-direction: column; } .panel { padding: 18px; } .project-row { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', value = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<div class="brand">Your workspace</div><h1>Workboard</h1>
    <section class="panel" aria-label="Create a project">
      ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/projects">
        <input type="hidden" name="filter" value="${filter}">
        <label for="project-name">Project name</label>
        <div class="fields"><input id="project-name" name="name" type="text" value="${escapeHtml(value)}"><button type="submit">Create project</button></div>
      </form>
    </section>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `<div class="panel project-row" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <div class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</div></div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button class="secondary" type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button class="secondary" type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create your first project above.'}</p>`}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', value = '') {
  const tasks = listTasks.all(project.id).filter((task) => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<div class="brand">Workboard</div><h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button class="secondary" type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <section class="panel task-create" aria-label="Create a task">
      ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/projects/${project.id}/tasks">
        <input type="hidden" name="filter" value="${filter}">
        <label for="task-title">Task title</label>
        <div class="fields"><input id="task-title" name="title" type="text" value="${escapeHtml(value)}"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
      </form>
    </section>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `<div class="panel task-row${task.completed ? ' completed' : ''}" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
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
      sendHtml(response, 200, projectsPage('', '', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const submittedName = form.get('name') || '';
      const name = submittedName.trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', submittedName, projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project tasks cannot be changed'));
          return;
        }
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const submittedTitle = form.get('title') || '';
          const title = submittedTitle.trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', submittedTitle));
            return;
          }
          createTask.run(project.id, title);
        }
        redirect(response, `/projects/${project.id}?filter=${filter}`);
        return;
      }
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    if (error.status === 413) {
      sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
