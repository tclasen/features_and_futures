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
// Due dates are calendar strings, never timezone-dependent timestamps.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Notes are plain text; upgrading initializes only this new field.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Soft deletion preserves all task fields and reserved ordering positions.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Separate ordering from identity so moves append without changing task IDs.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Remember positions even while a task belongs to another project.
// Seed current memberships without overwriting history on subsequent starts.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks ORDER BY position, id;
`);
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const recordCreatedPosition = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const rememberDestination = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ? AND deleted = 0');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ? AND deleted = 0');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];

function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    action();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through } : { from: '', through: '' };
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
}

// Normalize only for matching; preserve stored names and the applied query.
function matchesSearch(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function searchQuery(params) {
  return (params.get('search') || '').trim();
}

function searchField(query) {
  return `<input type="hidden" name="search" value="${escapeHtml(query)}">`;
}

function listLocation(filter, query) {
  if (filter === 'Active' && !query) return '/';
  const params = new URLSearchParams({ filter });
  if (query) params.set('search', query);
  return `/?${params}`;
}

function projectLocation(id, filter, prioritySelection, range = { from: '', through: '' }, queryText = '') {
  const query = new URLSearchParams({ filter });
  if (prioritySelection !== 'All') query.set('priorityFilter', prioritySelection);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (queryText) query.set('search', queryText);
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
    input, button, select, textarea { font: inherit; padding: 10px 14px; border-radius: 6px; }
    textarea { width: 100%; box-sizing: border-box; }
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
    .project fieldset { border: 0; margin: 0; padding: 0; min-width: 0;
      display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
    [role=alert] { color: #a51e25; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', enteredName = '', filter = 'Active', query = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, query));
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField(query)}
      <label for="project-name">Project name</label>
      <div class="create">
        <input id="project-name" name="name" value="${escapeHtml(enteredName)}" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form action="/" method="get">
      ${searchField(query)}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search projects</button>
    </form>
    <section aria-label="Projects">
      ${projects.map(project => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
          ${searchField(query)}
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', enteredTitle = '', enteredName = '', prioritySelection = 'All', range = { from: '', through: '' }, rangeInput = range, query = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    matchesSearch(task.title, query) &&
    (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (prioritySelection === 'All' || task.priority === prioritySelection) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || eligibleDestinations.length === 0;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${prioritySelection}">
      ${rangeFields(range)}
      ${searchField(query)}`;
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
      ${rangeFields(range)}
      ${searchField(query)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(value => `<option${value === prioritySelection ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}/due-range" method="post">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input type="text" id="due-from" name="rangeFrom" value="${escapeHtml(rangeInput.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input type="text" id="due-through" name="rangeThrough" value="${escapeHtml(rangeInput.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form action="/projects/${project.id}" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${prioritySelection}">
      ${rangeFields(range)}
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <section aria-label="Tasks">
      ${tasks.map(task => `<div class="project" data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <fieldset${project.archived || task.deleted ? ' disabled' : ''}>
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
        <form action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="create">
            <input type="text" id="task-due-date-${task.id}" name="dueDate" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/notes" method="post">
          ${filterFields}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived ? ' disabled' : ''}>${escapeHtml(task.notes).replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')}</textarea>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save notes</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/move" method="post">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${eligibleDestinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create">
            <input id="new-task-title-${task.id}" name="title" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
        </fieldset>
        <form action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}" method="post">
          ${filterFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
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
      html(response, 200, projectList('', '', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
      return;
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const filter = projectFilter(form.get('filter'));
      const name = enteredName.trim();
      if (!name) {
        html(response, 200, projectList('Project name is required', enteredName, filter, searchQuery(form)));
        return;
      }
      createProject.run(name);
      redirect(response, listLocation(filter, searchQuery(form)));
      return;
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(path);
    if (request.method === 'POST' && archiveMatch) {
      const form = await readForm(request);
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, listLocation(archiveMatch[2] === 'archive' ? 'Active' : 'Archived', searchQuery(form)));
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(path);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams), undefined, searchQuery(url.searchParams)));
        return;
      }
    }
    const rangeMatch = /^\/projects\/(\d+)\/due-range$/.exec(path);
    if (request.method === 'POST' && rangeMatch) {
      const project = findProject.get(rangeMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const previous = dueRange(form);
        const range = {
          from: (form.get('rangeFrom') || '').trim(),
          through: (form.get('rangeThrough') || '').trim(),
        };
        const error = !validDueDate(range.from) || !validDueDate(range.through)
          ? 'Due range must use valid YYYY-MM-DD dates'
          : range.from && range.through && range.from > range.through
            ? 'Due from must not be after Due through' : '';
        if (error) {
          html(response, 200, projectPage(project, filter, error, '', '', prioritySelection, previous, range, searchQuery(form)));
        } else {
          redirect(response, projectLocation(project.id, filter, prioritySelection, range, searchQuery(form)));
        }
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
          html(response, 200, projectPage(project, filter, 'Project name is required', '', enteredName, prioritySelection, dueRange(form), undefined, searchQuery(form)));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
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
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', '', prioritySelection, dueRange(form), undefined, searchQuery(form)));
          return;
        }
        updateDefaultPriority.run(priority, project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
        return;
      }
    }
    const deletionMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/(delete|restore)$/.exec(path);
    if (request.method === 'POST' && deletionMatch) {
      const project = findProject.get(deletionMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        const query = searchQuery(form);
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project', '', '', prioritySelection, range, undefined, query));
          return;
        }
        const result = setTaskDeleted.run(deletionMatch[3] === 'delete' ? 1 : 0, deletionMatch[2], project.id);
        if (!result.changes) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        redirect(response, projectLocation(project.id, filter, prioritySelection, range, query));
        return;
      }
    }
    const moveMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/move$/.exec(path);
    if (request.method === 'POST' && moveMatch) {
      const project = findProject.get(moveMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project', '', '', prioritySelection, range, undefined, searchQuery(form)));
          return;
        }
        if (!findTask.get(moveMatch[2], project.id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        const destination = destinations.all(project.id).find(item => String(item.id) === form.get('destination'));
        if (!destination) {
          html(response, 400, projectPage(project, filter, 'Choose an active destination project', '', '', prioritySelection, range, undefined, searchQuery(form)));
          return;
        }
        // First visits append after all established positions; returns reuse history.
        transaction(() => {
          rememberDestination.run(moveMatch[2], destination.id, destination.id);
          moveTask.run(destination.id, moveMatch[2], destination.id, moveMatch[2], project.id);
        });
        redirect(response, projectLocation(project.id, filter, prioritySelection, range, searchQuery(form)));
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
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', '', prioritySelection, dueRange(form), undefined, searchQuery(form)));
          return;
        }
        updatePriority.run(priority, priorityMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
        return;
      }
    }
    const notesMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/notes$/.exec(path);
    if (request.method === 'POST' && notesMatch) {
      const project = findProject.get(notesMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        const query = searchQuery(form);
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project', '', '', prioritySelection, range, undefined, query));
          return;
        }
        if (!findTask.get(notesMatch[2], project.id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        updateNotes.run(form.get('notes') || '', notesMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, range, query));
        return;
      }
    }
    const dueDateMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/.exec(path);
    if (request.method === 'POST' && dueDateMatch) {
      const project = findProject.get(dueDateMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project', '', '', prioritySelection));
          return;
        }
        if (!findTask.get(dueDateMatch[2], project.id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        const dueDate = (form.get('dueDate') || '').trim();
        if (!validDueDate(dueDate)) {
          html(response, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', '', '', prioritySelection, dueRange(form), undefined, searchQuery(form)));
          return;
        }
        updateDueDate.run(dueDate, dueDateMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
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
          html(response, 200, projectPage(project, filter, 'Task title is required', '', '', prioritySelection, dueRange(form), undefined, searchQuery(form)));
          return;
        }
        renameTask.run(title, taskRenameMatch[2], project.id);
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
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
            html(response, 200, projectPage(project, filter, 'Task title is required', enteredTitle, '', prioritySelection, dueRange(form), undefined, searchQuery(form)));
            return;
          }
          transaction(() => {
            const result = insertTask.run(project.id, title, project.default_priority, project.id);
            recordCreatedPosition.run(result.lastInsertRowid);
          });
        }
        redirect(response, projectLocation(project.id, filter, prioritySelection, dueRange(form), searchQuery(form)));
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
