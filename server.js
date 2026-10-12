import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    position INTEGER NOT NULL
  );
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec(`
    BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;
  `);
}
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS task_project_positions_by_project
    ON task_project_positions (project_id, position);
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const getProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const setDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const insertTask = database.prepare(`
  INSERT INTO tasks (project_id, title, priority, position)
  SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?
`);
const rememberTaskPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?
`);
const rememberDestinationPosition = database.prepare(`
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?
`);
const setTaskProject = database.prepare(`
  UPDATE tasks SET project_id = ?, position = (
    SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?
  )
  WHERE id = ? AND project_id = ?
`);
const getOwnedTask = database.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

function transaction(action) {
  database.exec('BEGIN');
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
  transaction(() => {
    const task = insertTask.run(projectId, title, priority, projectId);
    rememberTaskPosition.run(task.lastInsertRowid);
  });
}

function moveTask(taskId, sourceId, destinationId) {
  return transaction(() => {
    if (!getOwnedTask.get(taskId, sourceId)) return false;
    rememberDestinationPosition.run(taskId, destinationId, destinationId);
    setTaskProject.run(destinationId, taskId, destinationId, taskId, sourceId);
    return true;
  });
}

function isValidDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function dueRangeError(range) {
  if (!isValidDueDate(range.from) || !isValidDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
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
    :root { font-family: system-ui, sans-serif; color: #18293a; background: #f4f6f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 12px 0 32px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin-top: 36px; }
    .eyebrow { color: #52657a; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
    .create-form { padding: 24px; background: white; border: 1px solid #dce3eb; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 10px; }
    .controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 12px; border: 1px solid #94a3b8; border-radius: 6px; font: inherit; }
    textarea { width: 100%; padding: 12px; border: 1px solid #94a3b8; border-radius: 6px; font: inherit; resize: vertical; }
    button { padding: 12px 18px; border: 1px solid #2456ae; border-radius: 6px; background: #2456ae; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1b438c; }
    button:disabled { background: #64748b; border-color: #64748b; cursor: default; }
    :focus-visible { outline: 3px solid #e99d27; outline-offset: 3px; }
    [role="alert"] { color: #a22424; margin: 0 0 16px; }
    .project-list { list-style: none; padding: 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; margin-bottom: 12px; background: white; border: 1px solid #dce3eb; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-summary { display: block; margin-top: 6px; color: #52657a; font-size: 14px; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .project-row form { flex-shrink: 0; }
    .empty { color: #52657a; }
    select { padding: 10px; border: 1px solid #94a3b8; border-radius: 6px; background: white; font: inherit; }
    .task-list { list-style: none; padding: 0; }
    .task-row { padding: 18px 20px; margin-bottom: 12px; background: white; border: 1px solid #dce3eb; border-radius: 10px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input { flex: none; }
    .task-title { min-width: 0; }
    .task-rename { margin-top: 16px; }
    .task-rename label { display: block; margin-bottom: 10px; }
    .task-rename input { flex: 1; }
    @media (max-width: 520px) { main { margin-top: 32px; } .controls { flex-direction: column; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function matchesSearch(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function projectListQuery(filter, search) {
  return new URLSearchParams({ filter, search }).toString();
}

function projectsPage(error = '', filter = 'Active', search = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, search));
  const query = escapeHtml(projectListQuery(filter, search));
  return page('Projects', `
    <p class="eyebrow">Your workspace</p>
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects?${query}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    <form method="get" action="/">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create-form" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <div class="controls">
        <input id="project-search" name="search" type="text" value="${escapeHtml(search)}">
        <button type="submit">Search projects</button>
      </div>
    </form>
    ${projects.length ? `<ul class="project-list">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <span class="project-summary" data-testid="project-summary">${project.completed}/${project.total} completed</span>
        </div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}?${query}"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
        </div>
      </li>`).join('')}</ul>` : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create a project to get started.'}</p>`}
  `);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

function taskFilterQuery(filter, priorityFilter, dueRange = { from: '', through: '' }, search = '') {
  const query = new URLSearchParams({ filter });
  if (priorityFilter !== 'All') query.set('priorityFilter', priorityFilter);
  if (dueRange.from) query.set('dueFrom', dueRange.from);
  if (dueRange.through) query.set('dueThrough', dueRange.through);
  if (search) query.set('search', search);
  return query.toString();
}

function downloadProject(response, project) {
  const document = {
    format: 'workboard-project',
    version: 1,
    project: {
      name: project.name,
      archived: Boolean(project.archived),
      defaultPriority: project.default_task_priority,
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
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(document, null, 2));
}

function projectPage(project, filter = 'All', error = '', priorityFilter = 'All', dueRange = { from: '', through: '' }, search = '') {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter(task =>
    matchesSearch(task.title, search) &&
    (filter === 'Deleted' ? Boolean(task.deleted) : (!task.deleted &&
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')))) &&
    (priorityFilter === 'All' || task.priority === priorityFilter) &&
    ((!dueRange.from && !dueRange.through) || (task.due_date !== '' &&
      (!dueRange.from || task.due_date >= dueRange.from) &&
      (!dueRange.through || task.due_date <= dueRange.through))));
  const action = `/projects/${project.id}`;
  const query = escapeHtml(taskFilterQuery(filter, priorityFilter, dueRange, search));
  // HTML strips a textarea's first newline; prefix one to preserve notes starting with a newline.
  return page(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="${action}/export" method="get"><button type="submit">Download project</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create-form" method="post" action="${action}/rename?${query}">
      <label for="new-project-name">New project name</label>
      <div class="controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="create-form" method="post" action="${action}/default-task-priority?${query}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map(priority => `<option${project.default_task_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form class="create-form" method="post" action="${action}/tasks?${query}">
      <label for="task-title">Task title</label>
      <div class="controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form method="get" action="${action}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${priorityFilter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <input type="hidden" name="dueFrom" value="${escapeHtml(dueRange.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(dueRange.through)}">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
    </form>
    <form class="create-form" method="get" action="${action}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(dueRange.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(dueRange.through)}">
      <label for="task-search">Task search</label>
      <div class="controls">
        <input id="task-search" name="search" type="text" value="${escapeHtml(search)}">
        <button type="submit">Search tasks</button>
      </div>
    </form>
    <form class="create-form" method="post" action="${action}/due-range?${query}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="dueFrom" type="text" value="${escapeHtml(dueRange.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="dueThrough" type="text" value="${escapeHtml(dueRange.through)}">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? `<ul class="task-list">${tasks.map(task => `
      <li class="task-row" data-testid="task-row">
        <form method="post" action="${action}/tasks/${task.id}?${query}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span class="task-title">${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/rename?${query}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="controls">
            <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived || task.deleted ? ' disabled' : ''}>
            <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/priority?${query}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${taskPriorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/due-date?${query}">
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="controls">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived || task.deleted ? ' disabled' : ''}>
            <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/notes?${query}">
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived || task.deleted ? ' disabled' : ''}>\n${escapeHtml(task.notes)}</textarea>
          <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/move?${query}">
          <label for="destination-project-${task.id}">Destination project</label>
          <div class="controls">
            <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled || task.deleted ? ' disabled' : ''}>
              ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
            </select>
            <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
          </div>
        </form>
        <form class="task-rename" method="post" action="${action}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}?${query}">
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore' : 'Delete'} task</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

async function readForm(request) {
  const chunks = [];
  let bodySize = 0;
  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > 1_048_576) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const search = (url.searchParams.get('search') ?? '').trim();
    const projectFilter = url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active';
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', projectFilter, search));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      const name = (body.get('name') ?? '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required', projectFilter, search));
        return;
      }
      createProject.run(name);
      redirect(response, search ? `/?${projectListQuery(projectFilter, search)}` : '/');
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      if (!Number.isSafeInteger(id) || !setProjectArchived.run(url.pathname.endsWith('/archive') ? 1 : 0, id).changes) {
        html(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      redirect(response, search ? `/?${projectListQuery(projectFilter, search)}` : (url.pathname.endsWith('/restore') ? '/?filter=Archived' : '/'));
    } else if ((request.method === 'GET' && /^\/projects\/\d+(?:\/export)?$/.test(url.pathname)) ||
      (request.method === 'POST' && /^\/projects\/\d+\/(?:rename|default-task-priority|due-range|tasks(?:\/\d+(?:\/(?:rename|priority|due-date|notes|move|delete|restore))?)?)$/.test(url.pathname))) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      if (request.method === 'GET' && url.pathname.endsWith('/export')) {
        downloadProject(response, project);
        return;
      }
      const requestedFilter = url.searchParams.get('filter');
      const filter = ['Open', 'Completed', 'Deleted'].includes(requestedFilter) ? requestedFilter : 'All';
      const requestedPriorityFilter = url.searchParams.get('priorityFilter');
      const priorityFilter = taskPriorities.includes(requestedPriorityFilter) ? requestedPriorityFilter : 'All';
      const dueRange = {
        from: (url.searchParams.get('dueFrom') ?? '').trim(),
        through: (url.searchParams.get('dueThrough') ?? '').trim(),
      };
      // Query parameters carry only the applied range between page requests.
      const rangeError = dueRangeError(dueRange);
      if (rangeError) {
        html(response, 400, page('Invalid due range', `<p role="alert">${rangeError}</p>`));
        return;
      }
      if (request.method === 'GET') {
        html(response, 200, projectPage(project, filter, '', priorityFilter, dueRange, search));
      } else {
        const body = await readForm(request);
        const currentProject = getProject.get(project.id);
        if (url.pathname.endsWith('/due-range')) {
          const nextRange = {
            from: (body.get('dueFrom') ?? '').trim(),
            through: (body.get('dueThrough') ?? '').trim(),
          };
          const error = dueRangeError(nextRange);
          if (error) {
            html(response, 400, projectPage(currentProject, filter, error, priorityFilter, dueRange, search));
          } else {
            redirect(response, `/projects/${project.id}?${taskFilterQuery(filter, priorityFilter, nextRange, search)}`);
          }
          return;
        }
        if (currentProject.archived) {
          html(response, 403, projectPage(currentProject, filter, 'Archived project', priorityFilter, dueRange, search));
          return;
        }
        const taskId = url.pathname.split('/')[4];
        if (taskId !== undefined) {
          const task = getOwnedTask.get(Number(taskId), project.id);
          if (!task) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
          if (task.deleted && !url.pathname.endsWith('/restore')) {
            html(response, 403, projectPage(currentProject, filter, 'Deleted task must be restored before editing', priorityFilter, dueRange, search));
            return;
          }
        }
        if (taskId !== undefined && (url.pathname.endsWith('/delete') || url.pathname.endsWith('/restore'))) {
          setTaskDeleted.run(url.pathname.endsWith('/delete') ? 1 : 0, Number(taskId), project.id);
        } else if (url.pathname.endsWith('/default-task-priority')) {
          const priority = body.get('priority');
          if (!taskPriorities.includes(priority)) {
            html(response, 400, projectPage(currentProject, filter, 'Invalid task priority', priorityFilter, dueRange, search));
            return;
          }
          setDefaultTaskPriority.run(priority, project.id);
        } else if (url.pathname.endsWith('/rename') && taskId === undefined) {
          const name = (body.get('name') ?? '').trim();
          if (!name) {
            html(response, 400, projectPage(currentProject, filter, 'Project name is required', priorityFilter, dueRange, search));
            return;
          }
          renameProject.run(name, project.id);
        } else if (taskId === undefined) {
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required', priorityFilter, dueRange, search));
            return;
          }
          createTask(project.id, title, currentProject.default_task_priority);
        } else if (url.pathname.endsWith('/move')) {
          const destinationId = Number(body.get('destinationProject'));
          const destination = Number.isSafeInteger(destinationId) ? getProject.get(destinationId) : undefined;
          if (!destination || destination.archived || destination.id === project.id) {
            html(response, 400, projectPage(currentProject, filter, 'Choose an active destination project', priorityFilter, dueRange, search));
            return;
          }
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !moveTask(id, project.id, destination.id)) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (url.pathname.endsWith('/rename')) {
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            html(response, 400, projectPage(currentProject, filter, 'Task title is required', priorityFilter, dueRange, search));
            return;
          }
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !renameTask.run(title, id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (url.pathname.endsWith('/due-date')) {
          const dueDate = (body.get('dueDate') ?? '').trim();
          if (!isValidDueDate(dueDate)) {
            html(response, 400, projectPage(currentProject, filter, 'Due date must be a valid YYYY-MM-DD date', priorityFilter, dueRange, search));
            return;
          }
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !setTaskDueDate.run(dueDate, id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (url.pathname.endsWith('/notes')) {
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !setTaskNotes.run(body.get('notes') ?? '', id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (url.pathname.endsWith('/priority')) {
          const priority = body.get('priority');
          if (!taskPriorities.includes(priority)) {
            html(response, 400, projectPage(currentProject, filter, 'Invalid task priority', priorityFilter, dueRange, search));
            return;
          }
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !setTaskPriority.run(priority, id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const id = Number(taskId);
          if (!Number.isSafeInteger(id) || !updateTask.run(body.get('completed') === '1' ? 1 : 0, id, project.id).changes) {
            html(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, `/projects/${project.id}?${taskFilterQuery(filter, priorityFilter, dueRange, search)}`);
      }
    } else {
      html(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(response, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!response.headersSent) html(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
