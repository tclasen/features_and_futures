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
// Migrate databases created before project archiving was introduced.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Project defaults apply only to subsequent task creation.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Existing tasks receive Normal when migrating from before task priorities.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Dates are optional calendar days, stored without timezone conversion.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Notes are plain text; upgrades leave all existing fields untouched.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Soft deletion preserves all task fields and reserved project positions.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Separate ordering from identity so moved tasks append without changing their IDs.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Remember a separate position for every project a task has belonged to.
// Seed current positions when upgrading; repeated startups leave history intact.
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
const priorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const getProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const nextPosition = database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberedPosition = database.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const rememberPosition = database.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const destinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
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

function createTask(projectId, title, priority) {
  return transaction(() => {
    const position = nextPosition.get(projectId).position;
    const result = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(result.lastInsertRowid, projectId, position);
    return result;
  });
}

function moveTask(destinationId, taskId, sourceId) {
  return transaction(() => {
    const remembered = rememberedPosition.get(taskId, destinationId);
    const position = remembered?.position ?? nextPosition.get(destinationId).position;
    const result = setTaskProject.run(destinationId, position, taskId, sourceId);
    if (result.changes && !remembered) rememberPosition.run(taskId, destinationId, position);
    return result;
  });
}
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const getTask = database.prepare('SELECT deleted FROM tasks WHERE id = ? AND project_id = ?');
const setTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
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
  // Carry the applied query with the boundaries through every edit and redirect.
  return { from, through, search: searchQuery(params) };
}

function rangeError(range) {
  if ((range.from && !validDueDate(range.from)) || (range.through && !validDueDate(range.through))) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

// Normalize only for matching; keep stored and displayed names/titles unchanged.
function searchMatches(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function searchQuery(params) {
  return (params.get('search') || '').trim();
}

function projectLocation(id, filter, priority, range) {
  const search = range.search || '';
  const params = new URLSearchParams({ filter });
  if (search) params.set('search', search);
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  return `/projects/${id}?${params}`;
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
  return new URLSearchParams(Buffer.concat(chunks).toString());
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
  <title>${escapeHtml(title)} — Workboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', filter = 'Active', search = '') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => searchMatches(project.name, search)).map(project => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <input type="hidden" name="search" value="${escapeHtml(search)}">
        <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/" method="get" class="filter-form">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/" method="get" class="filter-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search projects</button>
    </form>
    <ul class="projects">${rows}</ul>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const search = range.search || '';
  const searchInput = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const rangeInputs = `${searchInput}<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const filterInputs = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">${rangeInputs}`;
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || eligibleDestinations.length === 0;
  const rows = listTasks.all(project.id)
    .filter(task => searchMatches(task.title, search)
      && (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted
        && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')))
      && (priority === 'All' || task.priority === priority)
      && ((!range.from && !range.through) || (task.due_date
        && (!range.from || task.due_date >= range.from)
        && (!range.through || task.due_date <= range.through))))
    .map(task => {
      const readOnly = project.archived || task.deleted;
      const taskMoveDisabled = readOnly || moveDisabled;
      return `
      <li data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          ${filterInputs}
          <input type="checkbox" name="completed" value="1"
            aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${readOnly ? 'disabled' : ''}
            onchange="this.form.requestSubmit()">
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${filterInputs}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority" onchange="this.form.requestSubmit()"${readOnly ? ' disabled' : ''}>
            ${priorities.map(value => `<option${task.priority === value ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
          ${filterInputs}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="input-group">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${readOnly ? ' disabled' : ''}>
            <button type="submit"${readOnly ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/notes" method="post">
          ${filterInputs}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${readOnly ? ' disabled' : ''}>
${escapeHtml(task.notes)}</textarea>
          <button type="submit"${readOnly ? ' disabled' : ''}>Save notes</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterInputs}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="input-group">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${readOnly ? ' disabled' : ''}>
            <button type="submit"${readOnly ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/move" method="post">
          ${filterInputs}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${taskMoveDisabled ? ' disabled' : ''}>
            ${eligibleDestinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${taskMoveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}" method="post">
          ${filterInputs}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </li>`;
    }).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form action="/projects/${project.id}/export" method="get">${filterInputs}<button type="submit">Download project</button></form>
    <form action="/projects/${project.id}/rename" method="post" class="create-form">
      ${filterInputs}
      <label for="new-project-name">New project name</label>
      <div class="input-group">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="/projects/${project.id}/default-priority" method="post" class="create-form">
      ${filterInputs}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority" onchange="this.form.requestSubmit()"${project.archived ? ' disabled' : ''}>
        ${priorities.map(value => `<option${project.default_priority === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}/tasks" method="post" class="create-form">
      ${filterInputs}
      <label for="task-title">Task title</label>
      <div class="input-group">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects/${project.id}/due-range" method="get" class="filter-form">
      ${filterInputs}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(range.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(range.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form action="/projects/${project.id}" method="get" class="filter-form">
      ${rangeInputs}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(value => `<option${priority === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}" method="get" class="filter-form">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search tasks</button>
    </form>
    <ul class="projects tasks">${rows}</ul>`);
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
    } else if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(styles);
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      const filter = projectFilter(form.get('filter'));
      const search = searchQuery(form);
      if (!name) {
        sendHtml(response, 422, projectList('Project name is required', filter, search));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: `/?${new URLSearchParams({ filter, search })}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority, range));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority, range));
        return;
      }
      setDefaultPriority.run(priority, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, range) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', priority, range));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectPage(project, filter, 'Project name is required', priority, range));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, range) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const result = setProjectArchived.run(action === 'archive' ? 1 : 0, projectId);
      if (!result.changes) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      response.writeHead(303, { Location: `/?${new URLSearchParams({ filter: action === 'archive' ? 'Active' : 'Archived', search: searchQuery(form) })}` });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+\/export$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(project.id).map(task => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted),
          })),
        },
      };
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
      });
      response.end(JSON.stringify(document, null, 2));
    } else if (request.method === 'GET' && /^\/projects\/\d+(?:\/due-range)?$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const filter = taskFilter(url.searchParams.get('filter'));
      const priority = priorityFilter(url.searchParams.get('priorityFilter'));
      let range = dueRange(url.searchParams);
      // Only valid ranges can become applied state, including on direct URLs.
      if (rangeError(range)) range = { from: '', through: '', search: range.search };
      if (url.pathname.endsWith('/due-range')) {
        const candidate = {
          search: range.search,
          from: (url.searchParams.get('from') || '').trim(),
          through: (url.searchParams.get('through') || '').trim(),
        };
        const error = rangeError(candidate);
        if (error) {
          sendHtml(response, 422, projectPage(project, filter, error, priority, range));
          return;
        }
        response.writeHead(303, { Location: projectLocation(project.id, filter, priority, candidate) });
        response.end();
        return;
      }
      sendHtml(response, 200, projectPage(project, filter, '', priority, range));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(rename|priority|due-date|move|notes|delete|restore))?)?$/.test(url.pathname)) {
      const [, , projectId, , taskId, action] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority, range));
        return;
      }
      if (taskId) {
        const task = getTask.get(taskId, project.id);
        if (!task) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        if (task.deleted && action !== 'restore') {
          sendHtml(response, 403, projectPage(project, filter, 'Deleted task is read-only', selectedPriority, range));
          return;
        }
        const title = (form.get('title') || '').trim();
        if (action === 'rename' && !title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required', selectedPriority, range));
          return;
        }
        const priority = form.get('priority');
        if (action === 'priority' && !priorities.includes(priority)) {
          sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority, range));
          return;
        }
        const dueDate = (form.get('dueDate') || '').trim();
        if (action === 'due-date' && dueDate && !validDueDate(dueDate)) {
          sendHtml(response, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, range));
          return;
        }
        const destination = action === 'move' ? getProject.get(form.get('destination') || '') : null;
        if (action === 'move' && (!destination || destination.archived || destination.id === project.id)) {
          sendHtml(response, 422, projectPage(project, filter, 'Choose an active destination project', selectedPriority, range));
          return;
        }
        const result = action === 'delete' || action === 'restore'
          ? setTaskDeleted.run(action === 'delete' ? 1 : 0, taskId, project.id)
          : action === 'move'
          ? moveTask(destination.id, taskId, project.id)
          : action === 'notes'
          ? setTaskNotes.run(form.get('notes') || '', taskId, project.id)
          : action === 'due-date'
          ? setTaskDueDate.run(dueDate, taskId, project.id)
          : action === 'rename'
          ? renameTask.run(title, taskId, project.id)
          : action === 'priority'
            ? setTaskPriority.run(priority, taskId, project.id)
            : updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required', selectedPriority, range));
          return;
        }
        createTask(project.id, title, project.default_priority);
      }
      response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, range) });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Unable to complete request'}</h1>`));
    } else {
      response.end();
    }
  }
});

const styles = `
  :root { font-family: system-ui, sans-serif; color: #172c40; background: #f3f6fa; }
  body { margin: 0; }
  main { max-width: 760px; margin: 60px auto; padding: 28px; }
  h1 { font-size: 2rem; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .input-group { display: flex; gap: 12px; flex-wrap: wrap; }
  textarea { display: block; box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #728396; border-radius: 6px; font: inherit; margin-bottom: 12px; }
  input { flex: 1; min-width: 160px; padding: 12px; border: 1px solid #728396; border-radius: 6px; font: inherit; }
  .create-form, .filter-form { margin-top: 24px; }
  select { padding: 10px; font: inherit; border: 1px solid #728396; border-radius: 6px; }
  input[type="checkbox"] { min-width: 0; width: 22px; height: 22px; cursor: pointer; }
  button { background: #245bc0; color: white; border: 0; border-radius: 6px; padding: 12px 18px; font: inherit; cursor: pointer; }
  button:hover { background: #194799; }
  button:disabled { background: #728396; cursor: not-allowed; }
  input:disabled, select:disabled, textarea:disabled { cursor: not-allowed; }
  :focus-visible { outline: 3px solid #9a5000; outline-offset: 3px; }
  .projects { list-style: none; padding: 0; margin-top: 28px; }
  .projects li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; padding: 18px; background: white; border: 1px solid #d5deea; border-radius: 8px; margin-bottom: 12px; }
  .projects span { overflow-wrap: anywhere; min-width: 0; }
  .projects button { white-space: nowrap; }
  [role="alert"] { color: #a01919; font-weight: 600; }
  @media (max-width: 480px) { main { margin: 20px auto; padding: 16px; } }
`;

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
