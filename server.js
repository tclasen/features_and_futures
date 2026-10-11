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
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);
// Existing databases from earlier checkpoints need the archive flag added in place.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Adding a default also initializes priorities for tasks saved by earlier versions.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults initialize independently of existing task priorities.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function projectLocation(id, filter, priority) {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  return `/projects/${id}?${query}`;
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
  <title>${escapeHtml(title)} — Workboard</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map((project) => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button>Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button>${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form action="/" method="get" class="filter-form">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button>Apply filter</button></noscript>
    </form>
    <ul aria-label="Projects">${rows}</ul>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">`;
  const rows = listTasks.all(project.id)
    .filter((task) => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority))
    .map((task) => `
      <li data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
          ${filterFields}
          <input type="checkbox" name="completed" value="1"
            aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''}
            onchange="this.form.requestSubmit()">
          <noscript><button>Save completion</button></noscript>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${taskPriorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
          <noscript><button${project.archived ? ' disabled' : ''}>Save priority</button></noscript>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="input-group">
            <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </li>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button>Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects/${project.id}/rename" method="post" class="create-form">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="input-group">
        <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="/projects/${project.id}/default-priority" method="post" class="filter-form">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form action="/projects/${project.id}/tasks" method="post" class="create-form">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="input-group">
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form action="/projects/${project.id}" method="get" class="filter-form">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button>Apply filter</button></noscript>
    </form>
    <ul aria-label="Tasks">${rows}</ul>`);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function send(response, status, body, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #172a3a; background: #f4f7fa; }
  main { max-width: 760px; margin: 3rem auto; padding: 2rem; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; margin-bottom: .5rem; font-weight: 600; }
  .input-group { display: flex; gap: .75rem; flex-wrap: wrap; }
  .create-form, .filter-form { margin-top: 1.5rem; }
  select { padding: .6rem; font: inherit; }
  input[type="checkbox"] { width: 1.25rem; height: 1.25rem; cursor: pointer; }
  input[type="text"] { flex: 1; min-width: 180px; border: 1px solid #667789; border-radius: 5px; padding: .7rem; font: inherit; }
  button { cursor: pointer; border: 0; border-radius: 5px; background: #225ca0; color: white; padding: .75rem 1rem; font: inherit; }
  button:hover { background: #174579; }
  :focus-visible { outline: 3px solid #e29c26; outline-offset: 3px; }
  ul { list-style: none; padding: 0; margin-top: 2rem; }
  button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: .55; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #dce3ea; }
  li span { overflow-wrap: anywhere; min-width: 0; }
  li form { flex-shrink: 0; }
  [role="alert"] { color: #a01818; }
  @media (max-width: 600px) { main { margin: 1rem; padding: 1rem; } }
`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (request.method === 'GET' && path === '/styles.css') {
      return send(response, 200, stylesheet, 'text/css; charset=utf-8');
    }
    if (request.method === 'GET' && path === '/') {
      return send(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) return send(response, 400, projectsPage('Project name is required'));
      createProject.run(name);
      return redirect(response, '/');
    }
    const defaultMatch = path.match(/^\/projects\/([1-9]\d*)\/default-priority$/);
    if (defaultMatch && request.method === 'POST') {
      const id = Number(defaultMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) return send(response, 404, 'Project not found');
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const prioritySelection = priorityFilter(form.get('priorityFilter'));
      if (project.archived) return send(response, 403, projectPage(project, filter, 'Archived project is read-only', prioritySelection));
      const priority = form.get('priority');
      if (!taskPriorities.includes(priority)) {
        return send(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection));
      }
      updateDefaultPriority.run(priority, id);
      return redirect(response, projectLocation(id, filter, prioritySelection));
    }
    const renameMatch = path.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (renameMatch && request.method === 'POST') {
      const id = Number(renameMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) return send(response, 404, 'Project not found');
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) return send(response, 403, projectPage(project, filter, 'Archived project is read-only', priority));
      const name = (form.get('name') || '').trim();
      if (!name) return send(response, 400, projectPage(project, filter, 'Project name is required', priority));
      renameProject.run(name, id);
      return redirect(response, projectLocation(id, filter, priority));
    }
    const archiveMatch = path.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (archiveMatch && request.method === 'POST') {
      const id = Number(archiveMatch[1]);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) return send(response, 404, 'Project not found');
      updateArchive.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
      return redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
    }
    const match = path.match(/^\/projects\/([1-9]\d*)(?:\/(tasks)(?:\/([1-9]\d*)\/(completion|rename|priority))?)?$/);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project && request.method === 'GET' && !match[2]) {
        return send(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
      }
      if (project && request.method === 'POST' && match[2]) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        if (project.archived) return send(response, 403, projectPage(project, filter, 'Archived project is read-only', prioritySelection));
        if (match[3]) {
          const taskId = Number(match[3]);
          if (!Number.isSafeInteger(taskId)) return send(response, 404, 'Task not found');
          let result;
          if (match[4] === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) return send(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection));
            result = renameTask.run(title, taskId, id);
          } else if (match[4] === 'priority') {
            const priority = form.get('priority');
            if (!taskPriorities.includes(priority)) {
              return send(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection));
            }
            result = updatePriority.run(priority, taskId, id);
          } else {
            result = updateCompletion.run(form.get('completed') === '1' ? 1 : 0, taskId, id);
          }
          if (!result.changes) return send(response, 404, 'Task not found');
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) return send(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection));
          createTask.run(id, title, project.default_priority);
        }
        return redirect(response, projectLocation(id, filter, prioritySelection));
      }
    }
    send(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) send(response, error.status || 500, 'Unable to complete request', 'text/plain; charset=utf-8');
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
