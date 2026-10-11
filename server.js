import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
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
  CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, id);
`);
// Upgrade databases created before archive support without changing existing IDs or tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Project defaults apply only to subsequent task creation.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Existing tasks retain the original Normal default.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function projectLocation(id, filter, prioritySelection) {
  const query = new URLSearchParams({ filter });
  if (prioritySelection !== 'All') query.set('priorityFilter', prioritySelection);
  return `/projects/${id}?${query}`;
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
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

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #192b40; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 48px auto; padding: 24px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, button, select { font: inherit; padding: 10px 14px; border-radius: 6px; }
    input { border: 1px solid #8896a8; max-width: 100%; box-sizing: border-box; }
    button { background: #234fa3; color: white; border: 1px solid #234fa3; cursor: pointer; }
    button:hover { background: #183c80; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .project { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #e09817; outline-offset: 3px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px;
      padding: 18px; margin-top: 12px; border: 1px solid #d7dee8; border-radius: 8px; background: white; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role=alert] { color: #a51e25; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', enteredName = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create">
        <input id="project-name" name="name" value="${escapeHtml(enteredName)}" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects">
      ${projects.map(project => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', enteredTitle = '', enteredName = '', prioritySelection = 'All') {
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (prioritySelection === 'All' || task.priority === prioritySelection));
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${prioritySelection}">`;
  return page(`<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="create">
        <input id="new-project-name" name="name" value="${escapeHtml(enteredName)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(value => `<option${value === project.default_priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="create">
        <input id="task-title" name="title" value="${escapeHtml(enteredTitle)}" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(value => `<option${value === prioritySelection ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map(task => `<div class="project" data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          ${filterFields}
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map(value => `<option${value === task.priority ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create">
            <input id="new-task-title-${task.id}" name="title" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </div>`).join('')}
    </section>`);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && path === '/') {
      html(response, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const filter = projectFilter(form.get('filter'));
      const name = enteredName.trim();
      if (!name) {
        html(response, 200, projectList('Project name is required', enteredName, filter));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(path);
    if (request.method === 'POST' && archiveMatch) {
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(path);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', '', priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(path);
    if (request.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          html(response, 403, projectPage(project, 'All', 'Archived project'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const enteredName = form.get('name') || '';
        const name = enteredName.trim();
        if (!name) {
          html(response, 200, projectPage(project, filter, 'Project name is required', '', enteredName, prioritySelection));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection));
        return;
      }
    }
    const defaultPriorityMatch = /^\/projects\/(\d+)\/default-priority$/.exec(path);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const project = findProject.get(defaultPriorityMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project', '', '', prioritySelection));
          return;
        }
        const priority = form.get('priority');
        if (!priorities.includes(priority)) {
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', '', prioritySelection));
          return;
        }
        updateDefaultPriority.run(priority, project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection));
        return;
      }
    }
    const priorityMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/priority$/.exec(path);
    if (request.method === 'POST' && priorityMatch) {
      const project = findProject.get(priorityMatch[1]);
      if (project) {
        if (project.archived) {
          html(response, 403, projectPage(project, 'All', 'Archived project'));
          return;
        }
        if (!findTask.get(priorityMatch[2], project.id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const priority = form.get('priority');
        if (!priorities.includes(priority)) {
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', '', prioritySelection));
          return;
        }
        updatePriority.run(priority, priorityMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection));
        return;
      }
    }
    const taskRenameMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/rename$/.exec(path);
    if (request.method === 'POST' && taskRenameMatch) {
      const project = findProject.get(taskRenameMatch[1]);
      if (project) {
        if (project.archived) {
          html(response, 403, projectPage(project, 'All', 'Archived project'));
          return;
        }
        if (!findTask.get(taskRenameMatch[2], project.id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 200, projectPage(project, filter, 'Task title is required', '', '', prioritySelection));
          return;
        }
        renameTask.run(title, taskRenameMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection));
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/.exec(path);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(response, 403, projectPage(project, 'All', 'Archived project'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(response, 404, page('<h1>Task not found</h1>'));
            return;
          }
        } else {
          const enteredTitle = form.get('title') || '';
          const title = enteredTitle.trim();
          if (!title) {
            html(response, 200, projectPage(project, filter, 'Task title is required', enteredTitle, '', prioritySelection));
            return;
          }
          createTask.run(project.id, title, project.default_priority);
        }
        redirect(response, projectLocation(project.id, filter, prioritySelection));
        return;
      }
    }
    html(response, 404, page('<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    html(response, error.status || 500, page(error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
