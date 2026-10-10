import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
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
`);
// Upgrade existing databases without changing project IDs or tasks.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const getProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];

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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #182337; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 48px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    form.create { display: grid; gap: 10px; margin-bottom: 32px; }
    input[type="checkbox"] { width: auto; }
    .task-row { background: white; border: 1px solid #d7dce5; padding: 16px; margin: 12px 0; border-radius: 8px; overflow-wrap: anywhere; }
    select { font: inherit; padding: 8px; margin: 12px 0; }
    input, button { font: inherit; padding: 10px 14px; border-radius: 6px; }
    input { border: 1px solid #7b8697; width: 100%; }
    button { border: 1px solid #234cb2; background: #234cb2; color: white; cursor: pointer; }
    .create button { justify-self: start; }
    button:hover { background: #183980; }
    button:disabled { background: #687385; border-color: #687385; cursor: not-allowed; }
    .project-row { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #d37800; outline-offset: 3px; }
    .project-row { background: white; border: 1px solid #d7dce5; padding: 16px; margin: 12px 0; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #9f1826; background: #ffecef; border: 1px solid #d28189; padding: 12px; border-radius: 6px; }
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
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <input type="hidden" name="filter" value="${filter}">
      <button type="submit">Create project</button>
    </form>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects">
      ${projects.map(project => `<div class="project-row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function projectLocation(projectId, filter, priority) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  return `/projects/${projectId}${query.size ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(`<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      ${filterFields}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      ${filterFields}
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map(task => `<div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"> ${escapeHtml(task.title)}</label>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          ${filterFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
      </div>`).join('')}
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 200, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const result = setArchived.run(action === 'archive' ? 1 : 0, projectId);
      if (!result.changes) {
        sendHtml(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority));
        return;
      }
      setDefaultPriority.run(priority, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority));
        return;
      }
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 200, projectPage(project, filter, 'Project name is required', selectedPriority));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks\/[1-9]\d*\/priority$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project || !getTask.get(taskId, projectId)) {
        sendHtml(response, 404, page('<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority));
        return;
      }
      setTaskPriority.run(priority, taskId, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project || !getTask.get(taskId, projectId)) {
        sendHtml(response, 404, page('<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority));
        return;
      }
      const title = (form.get('title') ?? '').trim();
      if (!title) {
        sendHtml(response, 200, projectPage(project, filter, 'Task title is required', selectedPriority));
        return;
      }
      renameTask.run(title, taskId, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority));
        return;
      }
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          sendHtml(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') ?? '').trim();
        if (!title) {
          sendHtml(response, 200, projectPage(project, filter, 'Task title is required', selectedPriority));
          return;
        }
        createTask.run(project.id, title, project.default_priority);
      }
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority) });
      response.end();
    } else {
      sendHtml(response, 404, page('<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status ?? 500, page('<h1>Unable to complete request</h1>'));
  }
});

server.listen(port, '0.0.0.0', () => {
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
