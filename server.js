import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
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
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
const destinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
// Keep positions even while tasks belong to another project. Backfill current
// positions on upgrade without overwriting any previously remembered positions.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const rememberPosition = database.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const findPosition = database.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const findTaskOwner = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const setTaskProject = database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');

function transaction(action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function moveTask(taskId, sourceId, destinationId) {
  return transaction(() => {
    if (!findTaskOwner.get(taskId, sourceId)) return { changes: 0 };
    let remembered = findPosition.get(taskId, destinationId);
    if (!remembered) {
      rememberPosition.run(taskId, destinationId, destinationId);
      remembered = findPosition.get(taskId, destinationId);
    }
    return setTaskProject.run(destinationId, remembered.position, taskId, sourceId);
  });
}
const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const saveInitialPosition = database.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);

function createTask(projectId, title, priority) {
  return transaction(() => {
    const result = insertTask.run(projectId, title, priority, projectId);
    saveInitialPosition.run(result.lastInsertRowid);
    return result;
  });
}
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const taskPriorities = ['Low', 'Normal', 'High'];
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', ...taskPriorities].includes(value) ? value : 'All';
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

function asciiLower(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

function matchesSearch(value, query) {
  return asciiLower(value).includes(asciiLower(query));
}

function projectsLocation(filter, search) {
  const params = new URLSearchParams();
  if (filter === 'Archived') params.set('filter', filter);
  if (search) params.set('search', search);
  return params.size ? `/?${params}` : '/';
}

// Carry the applied search alongside the range through every task-page action.
function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through, search: (params.get('search') || '').trim() }
    : { from: '', through: '', search: (params.get('search') || '').trim() };
}

function rangeQuery(range) {
  const params = new URLSearchParams();
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  if (range.search) params.set('search', range.search);
  return params.size ? `&${params}` : '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
    body { margin: 0; background: #f4f6fa; color: #1c293d; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { padding: 10px; border: 1px solid #798496; border-radius: 5px; font: inherit; width: 100%; }
    button { padding: 10px 16px; border: 0; border-radius: 5px; background: #244ecb; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #193aa0; }
    :focus-visible { outline: 3px solid #e99500; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks { margin-top: 30px; }
    .task { border-top: 1px solid #dce1e9; padding: 16px 0; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; }
    input[type="checkbox"] { width: auto; flex-shrink: 0; }
    .filter { margin-top: 24px; }
    select { padding: 8px; font: inherit; }
    .create { margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce1e9; padding: 16px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .project { flex-wrap: wrap; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.6; }
    [role="alert"] { color: #a21d26; margin: 14px 0; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active', search = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, search));
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField}
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search projects</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map(project => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">${searchField}<button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || eligibleDestinations.length === 0;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">
      <input type="hidden" name="search" value="${escapeHtml(range.search || '')}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}`;
  const tasks = listTasks.all(project.id).filter(task =>
    matchesSearch(task.title, range.search || '') &&
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${range.from}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${range.through}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(range.search || '')}">
      <button type="submit">Search tasks</button>
    </form>
    <section class="tasks" aria-label="Tasks">
      ${tasks.map(task => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${taskPriorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${eligibleDestinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
      </div>`).join('')}
    </section>`);
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
    if (size > 64 * 1024) {
      const error = new Error('Request is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), (url.searchParams.get('search') || '').trim()));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 200, projectsPage('Project name is required', projectFilter(form.get('filter')), (form.get('search') || '').trim()));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: projectsLocation(projectFilter(form.get('filter')), (form.get('search') || '').trim()) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(url.pathname)) {
      const projectId = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const from = (form.get('from') || '').trim();
      const through = (form.get('through') || '').trim();
      const error = !validDueDate(from) || !validDueDate(through)
        ? 'Due range must use valid YYYY-MM-DD dates'
        : from && through && from > through ? 'Due from must not be after Due through' : '';
      if (error) {
        sendHtml(response, 200, projectPage(project, filter, error, priority, dueRange(form)));
        return;
      }
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}&priorityFilter=${priority}${rangeQuery({ from, through, search: (form.get('search') || '').trim() })}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const projectId = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      const priority = form.get('priority');
      if (!taskPriorities.includes(priority)) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
        return;
      }
      setDefaultPriority.run(priority, projectId);
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}${selectedPriority === 'All' ? '' : `&priorityFilter=${selectedPriority}`}${rangeQuery(dueRange(form))}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const projectId = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority, dueRange(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 200, projectPage(project, filter, 'Project name is required', priority, dueRange(form)));
        return;
      }
      renameProject.run(name, projectId);
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${rangeQuery(dueRange(form))}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const [, , id, action] = url.pathname.split('/');
      const projectId = Number(id);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      setArchived.run(action === 'archive' ? 1 : 0, projectId);
      response.writeHead(303, { Location: projectsLocation(action === 'archive' ? 'Active' : 'Archived', (form.get('search') || '').trim()) });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(?:rename|priority|due-date|move))?)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      if (parts[4]) {
        const taskId = Number(parts[4]);
        const isMove = parts[5] === 'move';
        const destinationId = Number(form.get('destination'));
        const destination = isMove && Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : null;
        if (isMove && (!destination || destination.archived || destinationId === projectId)) {
          sendHtml(response, 400, projectPage(project, filter, 'Select an active destination project', selectedPriority, dueRange(form)));
          return;
        }
        const isRename = parts[5] === 'rename';
        const isPriority = parts[5] === 'priority';
        const isDueDate = parts[5] === 'due-date';
        const dueDate = (form.get('dueDate') || '').trim();
        if (isDueDate && !validDueDate(dueDate)) {
          sendHtml(response, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, dueRange(form)));
          return;
        }
        const priority = form.get('priority');
        if (isPriority && !taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
          return;
        }
        const title = (form.get('title') || '').trim();
        if (isRename && !title) {
          sendHtml(response, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
          return;
        }
        const result = Number.isSafeInteger(taskId)
          ? (isMove
            ? moveTask(taskId, projectId, destinationId)
            : isRename
            ? renameTask.run(title, taskId, projectId)
            : isPriority
              ? setTaskPriority.run(priority, taskId, projectId)
              : isDueDate
                ? setTaskDueDate.run(dueDate, taskId, projectId)
                : updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId))
          : { changes: 0 };
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
          return;
        }
        createTask(projectId, title, project.default_priority);
      }
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}${selectedPriority === 'All' ? '' : `&priorityFilter=${selectedPriority}`}${rangeQuery(dueRange(form))}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
