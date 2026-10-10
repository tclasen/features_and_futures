import { createServer } from 'node:http';
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
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);
// Existing databases retain their IDs and tasks when archive support is added.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
// Default priorities also apply to tasks created before priority support.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults affect future task creation only; existing tasks retain their priorities.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
}
// Optional calendar dates start empty without changing existing task data.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function projectFilter(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function taskFilter(value) {
  return ['open', 'completed'].includes(value) ? value : 'all';
}

function dueRangeError(from, through) {
  if (!validDueDate(from) || !validDueDate(through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

function taskFilters(parameters) {
  const priority = parameters.get('priorityFilter');
  const dueFrom = (parameters.get('dueFrom') ?? '').trim();
  const dueThrough = (parameters.get('dueThrough') ?? '').trim();
  const invalidRange = dueRangeError(dueFrom, dueThrough);
  return {
    completion: taskFilter(parameters.get('filter')),
    priority: taskPriorities.includes(priority) ? priority : 'All',
    dueFrom: invalidRange ? '' : dueFrom,
    dueThrough: invalidRange ? '' : dueThrough,
  };
}

function projectUrl(projectId, filters) {
  const parameters = new URLSearchParams();
  if (filters.completion !== 'all') parameters.set('filter', filters.completion);
  if (filters.priority !== 'All') parameters.set('priorityFilter', filters.priority);
  if (filters.dueFrom) parameters.set('dueFrom', filters.dueFrom);
  if (filters.dueThrough) parameters.set('dueThrough', filters.dueThrough);
  const query = parameters.toString();
  return `/projects/${projectId}${query ? `?${query}` : ''}`;
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
    body { margin: 0; background: #f4f6fa; color: #19283c; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin-top: 0; font-size: 32px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { min-width: 0; width: 100%; padding: 11px; border: 1px solid #8996a8; border-radius: 6px; font: inherit; }
    select { padding: 11px; font: inherit; border: 1px solid #8996a8; border-radius: 6px; }
    .project-rename, .task-create, .task-filter { margin-top: 28px; }
    .task-row { padding: 18px 0; border-top: 1px solid #dce2eb; }
    .task-completion label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-completion input { width: 20px; height: 20px; flex-shrink: 0; }
    .task-rename, .task-priority, .task-due-date { margin-top: 16px; }
    button { padding: 11px 16px; border: 0; border-radius: 6px; background: #244fba; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    button:hover { background: #193b91; }
    :focus-visible { outline: 3px solid #e99f1b; outline-offset: 3px; }
    .create-controls { display: flex; gap: 12px; }
    .create-controls button { flex-shrink: 0; }
    .project-list { list-style: none; padding: 0; margin: 28px 0 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-top: 1px solid #dce2eb; }
    .project-row > div { min-width: 0; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .project-summary { display: block; margin-top: 6px; color: #556478; }
    [role="alert"] { color: #a21c20; margin: 16px 0; }
    .empty { color: #556478; margin-top: 28px; }
    @media (max-width: 560px) { main { margin: 20px 12px; padding: 24px; } .create-controls { flex-direction: column; } .project-row { flex-wrap: wrap; } }
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
      <div class="create-controls">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['active', 'Active'], ['archived', 'Archived']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul class="project-list" aria-label="Projects">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <div><span>${escapeHtml(project.name)}</span>
          <span class="project-summary" data-testid="project-summary">${project.completed}/${project.total} completed</span>
        </div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

function projectPage(project, filters = { completion: 'all', priority: 'All', dueFrom: '', dueThrough: '' }, error = '', renameError = '', taskError = null, rangeError = '') {
  const { completion: filter, priority: priorityFilter, dueFrom = '', dueThrough = '' } = filters;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${dueFrom}">
      <input type="hidden" name="dueThrough" value="${dueThrough}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeFields}`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'all' || Boolean(task.completed) === (filter === 'completed')) &&
    (priorityFilter === 'All' || task.priority === priorityFilter) &&
    ((!dueFrom && !dueThrough) || (task.due_date &&
      (!dueFrom || task.due_date >= dueFrom) && (!dueThrough || task.due_date <= dueThrough))));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="project-rename" method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}${renameError ? ' aria-invalid="true" aria-describedby="rename-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    ${renameError ? `<p id="rename-error" role="alert">${escapeHtml(renameError)}</p>` : ''}
    <form class="task-priority" method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map(priority =>
          `<option value="${priority}"${project.default_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form class="task-create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-filter" method="get" action="/projects/${project.id}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(priority =>
          `<option value="${priority}"${priorityFilter === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      ${filterFields}
      <input type="hidden" name="applyDueRange" value="1">
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${dueFrom}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${dueThrough}">
      <button type="submit">Apply due range</button>
    </form>
    ${rangeError ? `<p role="alert">${escapeHtml(rangeError)}</p>` : ''}
    ${tasks.length ? `<ul class="project-list" aria-label="Tasks">${tasks.map(task => `
      <li class="task-row" data-testid="task-row">
        <form class="task-completion" method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label>
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create-controls">
            <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}${taskError?.id === task.id && taskError.field === 'title' ? ` aria-invalid="true" aria-describedby="task-rename-error-${task.id}"` : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
        ${taskError?.id === task.id && taskError.field === 'title' ? `<p id="task-rename-error-${task.id}" role="alert">${escapeHtml(taskError.message)}</p>` : ''}
        <form class="task-priority" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${taskPriorities.map(priority =>
              `<option value="${priority}"${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="task-due-date" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="create-controls">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}${taskError?.id === task.id && taskError.field === 'dueDate' ? ` aria-invalid="true" aria-describedby="task-due-date-error-${task.id}"` : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        ${taskError?.id === task.id && taskError.field === 'dueDate' ? `<p id="task-due-date-error-${task.id}" role="alert">${escapeHtml(taskError.message)}</p>` : ''}
      </li>`).join('')}</ul>` : '<p class="empty">No matching tasks.</p>'}
  `);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
    if (size > 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
      return;
    }
    const defaultPriorityMatch = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(pathname);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const id = Number(defaultPriorityMatch[1]);
      const form = await readForm(request);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const filters = taskFilters(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filters, 'Archived project cannot be changed'));
          return;
        }
        const priority = form.get('priority');
        if (!taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filters, 'Default task priority must be Low, Normal, or High'));
          return;
        }
        updateDefaultPriority.run(priority, id);
        redirect(response, projectUrl(id, filters));
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(pathname);
    if (request.method === 'POST' && renameMatch) {
      const id = Number(renameMatch[1]);
      const form = await readForm(request);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const filters = taskFilters(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filters, '', 'Archived project cannot be changed'));
          return;
        }
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filters, '', 'Project name is required'));
          return;
        }
        renameProject.run(name, id);
        redirect(response, projectUrl(id, filters));
        return;
      }
    }
    const taskRenameMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/rename$/.exec(pathname);
    if (request.method === 'POST' && taskRenameMatch) {
      const projectId = Number(taskRenameMatch[1]);
      const taskId = Number(taskRenameMatch[2]);
      const form = await readForm(request);
      // Read current archive state after the request body has arrived.
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (project && Number.isSafeInteger(taskId) && findTask.get(taskId, projectId)) {
        const filters = taskFilters(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filters, 'Archived project cannot be changed'));
          return;
        }
        const title = (form.get('title') ?? '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filters, '', '', {
            id: taskId, field: 'title', message: 'Task title is required',
          }));
          return;
        }
        renameTask.run(title, taskId, projectId);
        redirect(response, projectUrl(projectId, filters));
        return;
      }
      sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
      return;
    }
    const taskPriorityMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/priority$/.exec(pathname);
    if (request.method === 'POST' && taskPriorityMatch) {
      const projectId = Number(taskPriorityMatch[1]);
      const taskId = Number(taskPriorityMatch[2]);
      const form = await readForm(request);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (project && Number.isSafeInteger(taskId) && findTask.get(taskId, projectId)) {
        const filters = taskFilters(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filters, 'Archived project cannot be changed'));
          return;
        }
        const priority = form.get('priority');
        if (!taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filters, 'Task priority must be Low, Normal, or High'));
          return;
        }
        updateTaskPriority.run(priority, taskId, projectId);
        redirect(response, projectUrl(projectId, filters));
        return;
      }
      sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
      return;
    }
    const taskDueDateMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/due-date$/.exec(pathname);
    if (request.method === 'POST' && taskDueDateMatch) {
      const projectId = Number(taskDueDateMatch[1]);
      const taskId = Number(taskDueDateMatch[2]);
      const form = await readForm(request);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (project && Number.isSafeInteger(taskId) && findTask.get(taskId, projectId)) {
        const filters = taskFilters(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filters, 'Archived project cannot be changed'));
          return;
        }
        const dueDate = (form.get('dueDate') ?? '').trim();
        if (!validDueDate(dueDate)) {
          sendHtml(response, 400, projectPage(project, filters, '', '', {
            id: taskId, field: 'dueDate', message: 'Due date must be a valid YYYY-MM-DD date',
          }));
          return;
        }
        updateTaskDueDate.run(dueDate, taskId, projectId);
        redirect(response, projectUrl(projectId, filters));
        return;
      }
      sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
      return;
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(pathname);
    if (request.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        const archived = archiveMatch[2] === 'archive';
        updateArchive.run(archived ? 1 : 0, id);
        redirect(response, archived ? '/' : '/?filter=archived');
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*))?)?$/.exec(pathname);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project && request.method === 'GET' && pathname === `/projects/${id}`) {
        const filters = taskFilters(searchParams);
        // Draft boundaries are separate from the applied range so validation cannot change membership.
        if (searchParams.get('applyDueRange') === '1') {
          const from = (searchParams.get('rangeFrom') ?? '').trim();
          const through = (searchParams.get('rangeThrough') ?? '').trim();
          const error = dueRangeError(from, through);
          if (error) {
            sendHtml(response, 400, projectPage(project, filters, '', '', null, error));
          } else {
            redirect(response, projectUrl(id, { ...filters, dueFrom: from, dueThrough: through }));
          }
          return;
        }
        sendHtml(response, 200, projectPage(project, filters));
        return;
      }
      if (project && request.method === 'POST' && pathname.includes('/tasks')) {
        const form = await readForm(request);
        const filters = taskFilters(form);
        const currentProject = findProject.get(id);
        if (currentProject.archived) {
          sendHtml(response, 403, projectPage(currentProject, filters, 'Archived project cannot be changed'));
          return;
        }
        if (!match[2]) {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filters, 'Task title is required'));
            return;
          }
          insertTask.run(id, title, currentProject.default_priority);
        } else {
          const taskId = Number(match[2]);
          if (!Number.isSafeInteger(taskId)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, projectUrl(id, filters));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status ?? 500, page('Error', '<h1>Unable to process request</h1>'));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
