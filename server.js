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
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
// Upgrade existing databases without changing project or task IDs.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`
    BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;
  `);
}
// Seed the current order on upgrade; remembered positions remain even while tasks are away.
// The legacy tasks.position column is retained for database compatibility only.
database.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;
`);
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listTasks = database.prepare(`
  SELECT tasks.id, title, completed, priority, due_date, notes FROM tasks
  JOIN task_positions ON task_positions.task_id = tasks.id
    AND task_positions.project_id = tasks.project_id
  WHERE tasks.project_id = ? ORDER BY task_positions.position, tasks.id
`);
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const rememberPosition = database.prepare(`
  INSERT INTO task_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?
  ON CONFLICT (task_id, project_id) DO NOTHING
`);
const updateTaskProject = database.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');

function inTransaction(operation) {
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
  return inTransaction(() => {
    const result = insertTask.run(projectId, title, priority);
    rememberPosition.run(result.lastInsertRowid, projectId, projectId);
    return result;
  });
}

function moveTask(destinationId, taskId, sourceId) {
  return inTransaction(() => {
    const result = updateTaskProject.run(destinationId, taskId, sourceId);
    if (result.changes) rememberPosition.run(taskId, destinationId, destinationId);
    return result;
  });
}
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

// Calendar arithmetic avoids timezone conversion and Date's special handling of years 0–99.
function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function dueRangeError(range) {
  if (!validDueDate(range.from) || !validDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

function readDueRange(fields, fromKey = 'dueFrom', throughKey = 'dueThrough') {
  return { from: (fields.get(fromKey) || '').trim(), through: (fields.get(throughKey) || '').trim() };
}

function savedDueRange(fields) {
  const range = readDueRange(fields);
  return dueRangeError(range) ? { from: '', through: '' } : range;
}

function dueRangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
}

function readSearch(fields) {
  return (fields.get('search') || '').trim();
}

// Normalize only for matching; keep saved names/titles and applied queries intact.
function matchesSearch(value, query) {
  const normalize = (text) => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function searchField(search = '') {
  return `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
}

function taskFilterFields(filter, priority, range, search) {
  return `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">
    ${dueRangeFields(range)}
    ${searchField(search)}`;
}

function projectLocation(id, filter, priority, range, search) {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (search) query.set('search', search);
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
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', filter = 'Active', search = '') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter((project) => matchesSearch(project.name, search)).map((project) => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        ${searchField(search)}
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField(search)}
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Projects</h2>
    <form action="/" method="get" class="project-filter">
      ${searchField(search)}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" data-auto-submit>
        ${['Active', 'Archived'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="/" method="get" class="project-filter">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search projects</button>
    </form>
    ${rows ? `<ul class="projects">${rows}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, search = '', draftRange = range) {
  const path = `/projects/${project.id}`;
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    matchesSearch(task.title, search) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  // HTML discards the first literal newline after <textarea>; supply one before the notes.
  // Encode carriage returns to avoid HTML source newline normalization.
  const rows = tasks.map((task) => `
    <li data-testid="task-row">
      <span>${escapeHtml(task.title)}</span>
      <form action="${path}/tasks/${task.id}/completion" method="post">
        ${taskFilterFields(filter, priority, range, search)}
        <input type="checkbox" name="completed" value="1"
          aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-auto-submit>
      </form>
      <form action="${path}/tasks/${task.id}/priority" method="post">
        ${taskFilterFields(filter, priority, range, search)}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority" data-auto-submit${project.archived ? ' disabled' : ''}>
          ${taskPriorities.map((priority) => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
        </select>
      </form>
      <form action="${path}/tasks/${task.id}/due-date" method="post">
        ${taskFilterFields(filter, priority, range, search)}
        <label for="task-due-date-${task.id}">Task due date</label>
        <div class="input-group">
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </div>
      </form>
      <form action="${path}/tasks/${task.id}/notes" method="post">
        ${taskFilterFields(filter, priority, range, search)}
        <label for="task-notes-${task.id}">Task notes</label>
        <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived ? ' disabled' : ''}>
${escapeHtml(task.notes).replace(/\r/g, '&#13;')}</textarea>
        <button type="submit"${project.archived ? ' disabled' : ''}>Save notes</button>
      </form>
      <form action="${path}/tasks/${task.id}/move" method="post">
        ${taskFilterFields(filter, priority, range, search)}
        <label for="destination-project-${task.id}">Destination project</label>
        <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
          ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
        </select>
        <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
      </form>
      <form action="${path}/tasks/${task.id}/rename" method="post">
        ${taskFilterFields(filter, priority, range, search)}
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
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form action="${path}/rename" method="post">
      ${taskFilterFields(filter, priority, range, search)}
      <label for="new-project-name">New project name</label>
      <div class="input-group">
        <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="${path}/default-priority" method="post">
      ${taskFilterFields(filter, priority, range, search)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority" data-auto-submit${project.archived ? ' disabled' : ''}>
        ${taskPriorities.map((option) => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <h2>Tasks</h2>
    <form action="${path}/tasks" method="post">
      ${taskFilterFields(filter, priority, range, search)}
      <label for="task-title">Task title</label>
      <div class="input-group">
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="${path}" method="get" class="task-filter">
      ${searchField(search)}
      ${dueRangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-auto-submit>
        ${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" data-auto-submit>
        ${['All', ...taskPriorities].map((option) => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="${path}" method="get" class="task-filter">
      ${searchField(search)}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <input type="hidden" name="appliedFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="appliedThrough" value="${escapeHtml(range.through)}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="dueFrom" type="text" value="${escapeHtml(draftRange.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="dueThrough" type="text" value="${escapeHtml(draftRange.through)}">
      <button type="submit" name="applyDueRange" value="1">Apply due range</button>
    </form>
    <form action="${path}" method="get" class="task-filter">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${dueRangeFields(range)}
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search tasks</button>
    </form>
    ${rows ? `<ul class="projects">${rows}</ul>` : '<p class="empty">No matching tasks.</p>'}
  `);
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
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #192b3b; background: #f3f6f9; }
  * { box-sizing: border-box; }
  main { max-width: 760px; margin: 48px auto; padding: 32px; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .input-group { display: flex; gap: 12px; flex-wrap: wrap; }
  textarea { display: block; max-width: 100%; padding: 10px; border: 1px solid #748595; border-radius: 5px; font: inherit; margin-bottom: 8px; }
  input { flex: 1; min-width: 160px; padding: 10px; border: 1px solid #748595; border-radius: 5px; font: inherit; }
  button { padding: 10px 16px; border: 0; border-radius: 5px; background: #165fc1; color: white; font: inherit; cursor: pointer; }
  button:hover { background: #10478f; }
  button:disabled { background: #748595; cursor: not-allowed; }
  input[type=checkbox] { min-width: auto; width: 22px; height: 22px; cursor: pointer; }
  select { padding: 10px; font: inherit; }
  .task-filter { margin-top: 24px; }
  :focus-visible { outline: 3px solid #d77b00; outline-offset: 3px; }
  .projects { padding: 0; list-style: none; }
  .projects li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #dce3ea; }
  .projects span { overflow-wrap: anywhere; min-width: 0; }
  .projects form { flex-shrink: 0; }
  [role=alert] { color: #a01818; }
  .empty { color: #536574; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(stylesheet);
    } else if (request.method === 'GET' && url.pathname === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(`document.addEventListener('change', (event) => {
        if (event.target.matches('[data-auto-submit]')) event.target.form.requestSubmit();
      });`);
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter')), readSearch(url.searchParams)));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      const filter = projectFilter(form.get('filter'));
      const search = readSearch(form);
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required', filter, search));
      } else {
        createProject.run(name);
        response.writeHead(303, { Location: search || filter !== 'Active'
          ? `/?${new URLSearchParams({ filter, search })}` : '/' });
        response.end();
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = savedDueRange(form);
      const search = readSearch(form);
      if (project.archived) {
        sendHtml(response, 409, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, range, search));
        return;
      }
      const priority = form.get('priority');
      if (!taskPriorities.includes(priority)) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, range, search));
        return;
      }
      updateProjectDefaultPriority.run(priority, id);
      response.writeHead(303, { Location: projectLocation(id, filter, selectedPriority, range, search) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = savedDueRange(form);
      const search = readSearch(form);
      if (project.archived) {
        sendHtml(response, 409, projectPage(project, filter, 'Archived project cannot be changed', priority, range, search));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectPage(project, filter, 'Project name is required', priority, range, search));
        return;
      }
      renameProject.run(name, id);
      response.writeHead(303, { Location: projectLocation(id, filter, priority, range, search) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      const search = readSearch(await readForm(request));
      updateProjectArchive.run(action === 'archive' ? 1 : 0, id);
      const location = action === 'archive' ? '/' : '/?filter=Archived';
      response.writeHead(303, { Location: search
        ? `${location}${location.includes('?') ? '&' : '?'}${new URLSearchParams({ search })}` : location });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const draftRange = readDueRange(url.searchParams);
        const error = dueRangeError(draftRange);
        const previousRange = readDueRange(url.searchParams, 'appliedFrom', 'appliedThrough');
        const range = error
          ? (dueRangeError(previousRange) ? { from: '', through: '' } : previousRange)
          : draftRange;
        sendHtml(response, error ? 400 : 200, projectPage(project,
          taskFilter(url.searchParams.get('filter')), error,
          priorityFilter(url.searchParams.get('priorityFilter')), range, readSearch(url.searchParams), draftRange));
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
      }
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/(?:completion|rename|priority|due-date|move|notes))?$/.test(url.pathname)) {
      const [, , projectId, , taskId, action] = url.pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><a href="/">Projects</a>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = savedDueRange(form);
      const search = readSearch(form);
      if (project.archived) {
        sendHtml(response, 409, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, range, search));
        return;
      }
      if (taskId) {
        const taskNumber = Number(taskId);
        const title = (form.get('title') || '').trim();
        if (action === 'rename' && !title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', selectedPriority, range, search));
          return;
        }
        const priority = form.get('priority');
        if (action === 'priority' && !taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, range, search));
          return;
        }
        const dueDate = (form.get('dueDate') || '').trim();
        if (action === 'due-date' && !validDueDate(dueDate)) {
          sendHtml(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, range, search));
          return;
        }
        let result = { changes: 0 };
        if (Number.isSafeInteger(taskNumber)) {
          if (action === 'rename') {
            result = renameTask.run(title, taskNumber, id);
          } else if (action === 'priority') {
            result = updateTaskPriority.run(priority, taskNumber, id);
          } else if (action === 'due-date') {
            result = updateTaskDueDate.run(dueDate, taskNumber, id);
          } else if (action === 'notes') {
            result = updateTaskNotes.run(form.get('notes') || '', taskNumber, id);
          } else if (action === 'move') {
            const destinationId = Number(form.get('destination'));
            const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
            if (!destination || destination.archived || destinationId === id) {
              sendHtml(response, 400, projectPage(project, filter, 'Destination must be another active project', selectedPriority, range, search));
              return;
            }
            result = moveTask(destinationId, taskNumber, id);
          } else {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskNumber, id);
          }
        }
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', selectedPriority, range, search));
          return;
        }
        createTask(id, title, project.default_priority);
      }
      response.writeHead(303, { Location: projectLocation(id, filter, selectedPriority, range, search) });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent && !response.destroyed) {
      sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    }
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
