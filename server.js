import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
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
// Upgrade existing databases without changing project IDs or task data.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
         COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC
`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
    :root { font-family: system-ui, sans-serif; color: #202b3d; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin: 0 0 28px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"] { flex: 1; min-width: 180px; font: inherit; padding: 11px 12px; border: 1px solid #8c99ab; border-radius: 6px; }
    select { font: inherit; padding: 10px; border: 1px solid #8c99ab; border-radius: 6px; }
    .task-create, .task-filter, .project-filter { margin-top: 24px; }
    .task-row { padding: 18px 0; border-top: 1px solid #dce2eb; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; overflow-wrap: anywhere; }
    .task-row input { width: 20px; height: 20px; flex-shrink: 0; }
    button { font: inherit; font-weight: 600; padding: 11px 16px; color: white; background: #254fc1; border: 0; border-radius: 6px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    button:hover { background: #193b99; }
    :focus-visible { outline: 3px solid #dd9b00; outline-offset: 3px; }
    .projects { padding: 0; margin: 28px 0 0; list-style: none; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 18px 0; border-top: 1px solid #dce2eb; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .empty { margin-top: 28px; color: #526077; }
    [role="alert"] { color: #a32121; margin: 16px 0 0; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px 18px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'active') {
  const projects = listProjects.all(filter === 'archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="project-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        <option value="active"${filter === 'active' ? ' selected' : ''}>Active</option>
        <option value="archived"${filter === 'archived' ? ' selected' : ''}>Archived</option>
      </select>
    </form>
    ${projects.length ? `<ul class="projects">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects to show.</p>'}
  `);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
}

function projectFilter(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function taskFilter(value) {
  return ['open', 'completed'].includes(value) ? value : 'all';
}

function projectPage(project, filter = 'all', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'all' || (filter === 'completed' ? task.completed : !task.completed));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="task-create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create-fields">
        <input id="task-title" name="title" type="text"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
      ${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul class="projects">${tasks.map(task => `
      <li class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

async function formBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(request);
      const name = (body.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required', projectFilter(body.get('filter'))));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
      return;
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'restore' ? '/?filter=archived' : '/');
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(response, 403, projectPage(project, taskFilter(url.searchParams.get('filter')), 'Archived project'));
          return;
        }
        const body = await formBody(request);
        const filter = taskFilter(body.get('filter'));
        if (taskMatch[2]) {
          const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const title = (body.get('title') || '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(project.id, title);
        }
        redirect(response, `/projects/${project.id}${filter === 'all' ? '' : `?filter=${filter}`}`);
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    html(response, 404, page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>'));
  } catch (error) {
    console.error(error);
    html(response, 500, page('Error', '<h1>Unable to complete the request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
