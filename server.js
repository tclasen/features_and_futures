import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
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
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const taskPriorities = ['Low', 'Normal', 'High'];
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep departed tasks' positions reserved so later arrivals always follow them.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS task_project_positions_order
    ON task_project_positions (project_id, position);
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const getProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const getTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const getRememberedPosition = database.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextProjectPosition = database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?');
const rememberPosition = database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const updateTaskProject = database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');

function transaction(operation) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  return transaction(() => {
    const { position } = nextProjectPosition.get(projectId);
    const result = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(result.lastInsertRowid, projectId, position);
    return result;
  });
}

function moveTask(taskId, sourceId, destinationId) {
  return transaction(() => {
    if (!getTask.get(taskId, sourceId)) return { changes: 0 };
    let remembered = getRememberedPosition.get(taskId, destinationId);
    if (!remembered) {
      remembered = nextProjectPosition.get(destinationId);
      rememberPosition.run(taskId, destinationId, remembered.position);
    }
    return updateTaskProject.run(destinationId, remembered.position, taskId, sourceId);
  });
}
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
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
    body { margin: 0; background: #f4f6fa; color: #17243a; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 16px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 12px; border: 1px solid #8795ab; border-radius: 6px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 18px; background: #284dcc; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193ba9; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.6; }
    :focus-visible { outline: 3px solid #e69b12; outline-offset: 3px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dde3ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .project-summary { margin-top: 6px; color: #5d6a80; }
    [role="alert"] { color: #a51a23; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #5d6a80; }
    .task-create { margin-top: 28px; }
    .task-filter { margin-top: 28px; }
    select { padding: 10px; font: inherit; border: 1px solid #8795ab; border-radius: 6px; }
    .task-row { padding: 18px 0; border-top: 1px solid #dde3ed; }
    .task-row .task-completion { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename, .task-priority, .task-due-date, .task-move { margin-top: 16px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function matchesSearch(value, query) {
  const foldAscii = text => text.replace(/[A-Z]/g, letter => letter.toLowerCase());
  return foldAscii(value).includes(foldAscii(query));
}

function searchQuery(values) {
  return (values.get('search') || '').trim();
}

function projectsLocation(filter, search = '') {
  const query = new URLSearchParams();
  if (filter !== 'Active') query.set('filter', filter);
  if (search) query.set('search', search);
  return `/${query.size ? `?${query}` : ''}`;
}

function projectsPage(error = '', filter = 'Active', search = '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, search));
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField}
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(search)}" autocomplete="off">
      <button type="submit">Search projects</button>
    </form>
    <div class="projects">
      ${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <div>
            <span class="project-name">${escapeHtml(project.name)}</span>
            <div class="project-summary" data-testid="project-summary">${project.completed_count}/${project.total_count} completed</div>
          </div>
          <div class="project-actions">
            <form method="get" action="/projects/${project.id}">
              <button type="submit">Open project</button>
            </form>
            <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
              <input type="hidden" name="filter" value="${filter}">
              ${searchField}
              <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
            </form>
          </div>
        </div>`).join('') : '<p class="empty">Your projects will appear here.</p>'}
    </div>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function dueRange(values) {
  const from = (values.get('dueFrom') || '').trim();
  const through = (values.get('dueThrough') || '').trim();
  return !dueRangeError(from, through) ? { from, through } : { from: '', through: '' };
}

function dueRangeError(from, through) {
  if ((from && !isValidDueDate(from)) || (through && !isValidDueDate(through))) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) return 'Due from must not be after Due through';
  return '';
}

function projectLocation(projectId, filter, priority, range = { from: '', through: '' }, search = '') {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (search) query.set('search', search);
  return `/projects/${projectId}${query.size ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', priority = 'All', error = '', range = { from: '', through: '' }, search = '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
    <input type="hidden" name="dueThrough" value="${range.through}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}${searchField}`;
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || !destinations.length;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    matchesSearch(task.title, search) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-create" method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="create-fields">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="task-priority" method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map(option => `<option${project.default_task_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="create-fields">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      ${rangeFields}${searchField}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" method="post" action="/projects/${project.id}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${range.from}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${range.through}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(search)}" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <div class="projects">
      ${tasks.length ? tasks.map(task => `
        <div class="task-row" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            ${filterFields}
            <label class="task-completion">
              <input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
          <form class="task-priority" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
            ${filterFields}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              ${taskPriorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
            ${filterFields}
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="create-fields">
              <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
          </form>
          <form class="task-move" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
            ${filterFields}
            <label for="destination-project-${task.id}">Destination project</label>
            <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>
              ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
            </select>
            <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
          </form>
          <form class="task-due-date" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
            ${filterFields}
            <label for="task-due-date-${task.id}">Task due date</label>
            <div class="create-fields">
              <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
            </div>
          </form>
        </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </div>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
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
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', projectFilter(form.get('filter')), searchQuery(form)));
        return;
      }
      createProject.run(name);
      redirect(response, projectsLocation(projectFilter(form.get('filter')), searchQuery(form)));
      return;
    }
    const dueRangeRoute = /^\/projects\/([1-9]\d*)\/due-range$/.exec(url.pathname);
    if (request.method === 'POST' && dueRangeRoute) {
      const project = getProject.get(dueRangeRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const search = searchQuery(form);
        const from = (form.get('from') || '').trim();
        const through = (form.get('through') || '').trim();
        const error = dueRangeError(from, through);
        if (error) {
          sendHtml(response, 400, projectPage(project, filter, priority, error, dueRange(form), search));
          return;
        }
        redirect(response, projectLocation(project.id, filter, priority, { from, through }, search));
        return;
      }
    }
    const defaultPriorityRoute = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultPriorityRoute) {
      const project = getProject.get(defaultPriorityRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const search = searchQuery(form);
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project defaults cannot be changed', range, search));
          return;
        }
        const defaultPriority = form.get('priority');
        if (!taskPriorities.includes(defaultPriority)) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Task priority is invalid', range, search));
          return;
        }
        updateProjectDefaultPriority.run(defaultPriority, project.id);
        redirect(response, projectLocation(project.id, filter, priority, range, search));
        return;
      }
    }
    const renameRoute = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameRoute) {
      const project = getProject.get(renameRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const search = searchQuery(form);
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived projects cannot be renamed', range, search));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Project name is required', range, search));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, priority, range, search));
        return;
      }
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveRoute) {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const result = updateProjectArchive.run(archiveRoute[2] === 'archive' ? 1 : 0, archiveRoute[1]);
      if (result.changes) {
        const filter = projectFilter(form.get('filter') || (archiveRoute[2] === 'archive' ? 'Active' : 'Archived'));
        redirect(response, projectsLocation(filter, searchQuery(form)));
        return;
      }
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = getProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')), '', dueRange(url.searchParams), searchQuery(url.searchParams)));
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(?:\/(rename|priority|due-date|move))?)?$/.exec(url.pathname);
    if (request.method === 'POST' && taskRoute) {
      const project = getProject.get(taskRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const search = searchQuery(form);
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project tasks cannot be changed', range, search));
          return;
        }
        const taskId = taskRoute[2];
        if (taskId) {
          let result;
          if (taskRoute[3] === 'move') {
            const destinationId = form.get('destinationProject') || '';
            const destination = /^[1-9]\d*$/.test(destinationId) ? getProject.get(destinationId) : null;
            if (!destination || destination.archived || destination.id === project.id) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Choose an active destination project', range, search));
              return;
            }
            result = moveTask(taskId, project.id, destination.id);
          } else if (taskRoute[3] === 'due-date') {
            const dueDate = (form.get('dueDate') || '').trim();
            if (dueDate && !isValidDueDate(dueDate)) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Due date must be a valid YYYY-MM-DD date', range, search));
              return;
            }
            result = updateTaskDueDate.run(dueDate, taskId, project.id);
          } else if (taskRoute[3] === 'priority') {
            const taskPriority = form.get('priority');
            if (!taskPriorities.includes(taskPriority)) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Task priority is invalid', range, search));
              return;
            }
            result = updateTaskPriority.run(taskPriority, taskId, project.id);
          } else if (taskRoute[3] === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required', range, search));
              return;
            }
            result = renameTask.run(title, taskId, project.id);
          } else {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required', range, search));
            return;
          }
          createTask(project.id, title, project.default_task_priority);
        }
        redirect(response, projectLocation(project.id, filter, priority, range, search));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Server error', '<h1>Something went wrong</h1>'));
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
