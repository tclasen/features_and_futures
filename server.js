import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
// Migrate databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive Normal priority while retaining their IDs and state.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults affect only future tasks; existing task priorities stay intact.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Empty dates represent tasks with no due date, including migrated tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Notes are plain text; upgrades initialize only this new field.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Soft deletion preserves fields and all remembered positions on upgrade.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Migrate the original creation order before introducing remembered positions.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET position = id');
}
// Retain positions even while tasks are away. Seed pre-existing tasks at their
// current positions without overwriting history on subsequent starts.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
const rememberPosition = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))
  ON CONFLICT (task_id, project_id) DO NOTHING`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?`);
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
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workboard</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #182434; background: #f4f6fa; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  input, textarea { width: 100%; padding: 12px; font: inherit; border: 1px solid #8c98aa; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #285ac8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #1945a7; }
  button:disabled { background: #8993a5; cursor: not-allowed; }
  .row { flex-wrap: wrap; }
  :focus-visible { outline: 3px solid #edac28; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  .filter { margin-top: 24px; }
  select { padding: 10px; font: inherit; }
  .task-check { width: 22px; height: 22px; }
  .task-title { flex: 1; margin: 0; overflow-wrap: anywhere; }
  .projects { margin-top: 32px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce2eb; padding: 16px 0; }
  .name { overflow-wrap: anywhere; min-width: 0; }
  .row form { flex-shrink: 0; }
  [role=alert] { color: #a21725; background: #fff0f1; padding: 12px; border-radius: 6px; }
  @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

// Normalize only for matching; stored names/titles keep their original whitespace.
function searchMatches(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, char => char.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function projectList(error = '', name = '', filter = 'Active', search = '') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => searchMatches(project.name, search)).map(project => `<div class="row" data-testid="project-row">
    <span class="name">${escape(project.name)}</span>
    <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
    <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
      <input type="hidden" name="search" value="${escape(search)}">
      <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
    </form>
  </div>`).join('');
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="search" value="${escape(search)}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escape(name)}">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <input type="hidden" name="search" value="${escape(search)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.submit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escape(search)}">
      <button type="submit">Search projects</button>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return { from, through };
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

function savedRange(params) {
  const range = dueRange(params);
  return { ...(rangeError(range) ? { from: '', through: '' } : range), search: (params.get('search') || '').trim() };
}

function redirectProject(res, project, filter, priority, range) {
  const params = new URLSearchParams({ filter, priorityFilter: priority });
  if (range.search) params.set('search', range.search);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  res.writeHead(303, { Location: `/projects/${project.id}?${params}` });
  res.end();
}

function renderProjectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const search = range.search || '';
  const rangeFields = `<input type="hidden" name="search" value="${escape(search)}"><input type="hidden" name="dueFrom" value="${escape(range.from)}"><input type="hidden" name="dueThrough" value="${escape(range.through)}">`;
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || !eligibleDestinations.length;
  const rows = listTasks.all(project.id)
    .filter(task => searchMatches(task.title, search)
      && (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')))
      && (priority === 'All' || task.priority === priority)
      && ((!range.from && !range.through) || (task.due_date
        && (!range.from || task.due_date >= range.from)
        && (!range.through || task.due_date <= range.through))))
    .map(task => `<div class="row" data-testid="task-row">
      <label class="task-title" for="task-${task.id}">${escape(task.title)}</label>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <input class="task-check" id="task-${task.id}" type="checkbox" name="completed" value="1"
          aria-label="Complete ${escape(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived || task.deleted ? 'disabled' : ''} onchange="this.form.submit()">
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.submit()">
          ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
        <label for="task-due-date-${task.id}">Task due date</label>
        <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escape(task.due_date)}"${project.archived || task.deleted ? ' disabled' : ''}>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
        <label for="task-notes-${task.id}">Task notes</label>
        <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived || task.deleted ? ' disabled' : ''}>
${escape(task.notes)}</textarea>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
        <label for="destination-project-${task.id}">Destination project</label>
        <select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
          ${eligibleDestinations.map(destination => `<option value="${destination.id}">${escape(destination.name)}</option>`).join('')}
        </select>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
        <label for="new-task-title-${task.id}">New task title</label>
        <input id="new-task-title-${task.id}" name="title" type="text" value="${escape(task.title)}"${project.archived || task.deleted ? ' disabled' : ''}>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
      </form>
    </div>`).join('');
  const content = `<h1>${escape(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escape(project.name)}"${project.archived ? ' disabled' : ''}>
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" action="/projects/${project.id}/default-priority" method="post">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.submit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.submit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" action="/projects/${project.id}/due-range" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="newDueFrom" type="text" value="${escape(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="newDueThrough" type="text" value="${escape(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" action="/projects/${project.id}/search" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="newSearch" type="text" value="${escape(search)}">
      <button type="submit">Search tasks</button>
    </form>
    <section aria-label="Tasks">${rows || '<p>No matching tasks.</p>'}</section>`;
  // Carry applied filters on edits, but returning to Projects starts fresh.
  return page(content.replace(/<form\b[\s\S]*?<\/form>/g, form =>
    form.includes('action="/"') ? form : form.replace('</form>', `${rangeFields}</form>`)));
}

async function formBody(req) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  const params = new URLSearchParams(body);
  req.appliedDueRange = savedRange(params);
  return params;
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    req.appliedDueRange = savedRange(url.searchParams);
    const projectPage = (...args) => renderProjectPage(...args, req.appliedDueRange);
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return html(res, 200, projectList('', '', projectFilter(url.searchParams.get('filter')), (url.searchParams.get('search') || '').trim()));
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(req);
      const name = (body.get('name') || '').trim();
      const filter = projectFilter(body.get('filter'));
      const search = (body.get('search') || '').trim();
      if (!name) return html(res, 422, projectList('Project name is required', '', filter, search));
      createProject.run(name);
      res.writeHead(303, { Location: `/?${new URLSearchParams({ filter, search })}` });
      return res.end();
    }
    // Deleted tasks are readable but cannot be edited or moved via direct requests.
    const taskAction = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)(?:\/(priority|due-date|notes|move|rename|delete|restore))?$/);
    if (req.method === 'POST' && taskAction) {
      const task = findTask.get(taskAction[2], taskAction[1]);
      if (task?.deleted && !['delete', 'restore'].includes(taskAction[3])) {
        const body = await formBody(req);
        const project = findProject.get(taskAction[1]);
        return html(res, 403, projectPage(project, taskFilter(body.get('filter')), 'Deleted task cannot be changed', priorityFilter(body.get('priorityFilter'))));
      }
      if (['delete', 'restore'].includes(taskAction[3])) {
        const project = findProject.get(taskAction[1]);
        if (!project || !task) return html(res, 404, page('<h1>Task not found</h1>'));
        const body = await formBody(req);
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
        setTaskDeleted.run(taskAction[3] === 'delete' ? 1 : 0, task.id, project.id);
        return redirectProject(res, project, filter, priority, req.appliedDueRange);
      }
    }
    const searchMatch = url.pathname.match(/^\/projects\/(\d+)\/search$/);
    if (req.method === 'POST' && searchMatch) {
      const project = findProject.get(searchMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      req.appliedDueRange.search = (body.get('newSearch') || '').trim();
      return redirectProject(res, project, taskFilter(body.get('filter')), priorityFilter(body.get('priorityFilter')), req.appliedDueRange);
    }
    const rangeMatch = url.pathname.match(/^\/projects\/(\d+)\/due-range$/);
    if (req.method === 'POST' && rangeMatch) {
      const project = findProject.get(rangeMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      const range = {
        from: (body.get('newDueFrom') || '').trim(),
        through: (body.get('newDueThrough') || '').trim(),
        search: req.appliedDueRange.search
      };
      const error = rangeError(range);
      if (error) return html(res, 422, projectPage(project, filter, error, priority));
      return redirectProject(res, project, filter, priority, range);
    }
    const renameMatch = url.pathname.match(/^\/projects\/(\d+)\/rename$/);
    if (req.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const name = (body.get('name') || '').trim();
      if (!name) return html(res, 422, projectPage(project, filter, 'Project name is required', priority));
      renameProject.run(name, project.id);
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const archiveMatch = url.pathname.match(/^\/projects\/(\d+)\/(archive|restore)$/);
    if (req.method === 'POST' && archiveMatch) {
      const body = await formBody(req);
      const search = (body.get('search') || '').trim();
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (!result.changes) return html(res, 404, page('<h1>Page not found</h1>'));
      res.writeHead(303, { Location: `/?${new URLSearchParams({ filter: archiveMatch[2] === 'archive' ? 'Active' : 'Archived', search })}` });
      return res.end();
    }
    const defaultPriorityMatch = url.pathname.match(/^\/projects\/(\d+)\/default-priority$/);
    if (req.method === 'POST' && defaultPriorityMatch) {
      const project = findProject.get(defaultPriorityMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const selectedPriority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority));
      const priority = body.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        return html(res, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority));
      }
      setDefaultPriority.run(priority, project.id);
      return redirectProject(res, project, filter, selectedPriority, req.appliedDueRange);
    }
    const priorityMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/priority$/);
    if (req.method === 'POST' && priorityMatch) {
      const project = findProject.get(priorityMatch[1]);
      if (!project || !findTask.get(priorityMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const selectedPriority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority));
      const priority = body.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        return html(res, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority));
      }
      setTaskPriority.run(priority, priorityMatch[2], project.id);
      return redirectProject(res, project, filter, selectedPriority, req.appliedDueRange);
    }
    const dueDateMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
    if (req.method === 'POST' && dueDateMatch) {
      const project = findProject.get(dueDateMatch[1]);
      if (!project || !findTask.get(dueDateMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const dueDate = (body.get('dueDate') || '').trim();
      if (dueDate && !validDueDate(dueDate)) {
        return html(res, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority));
      }
      setTaskDueDate.run(dueDate, dueDateMatch[2], project.id);
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const notesMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/notes$/);
    if (req.method === 'POST' && notesMatch) {
      const project = findProject.get(notesMatch[1]);
      if (!project || !findTask.get(notesMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      setTaskNotes.run(body.get('notes') || '', notesMatch[2], project.id);
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const moveMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
    if (req.method === 'POST' && moveMatch) {
      const body = await formBody(req);
      const project = findProject.get(moveMatch[1]);
      if (!project || !findTask.get(moveMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const destinationId = body.get('destination') || '';
      const destination = /^\d+$/.test(destinationId) ? findProject.get(destinationId) : null;
      if (!destination || destination.archived || destination.id === project.id) {
        return html(res, 422, projectPage(project, filter, 'Choose an active destination project', priority));
      }
      transaction(() => {
        rememberPosition.run(moveMatch[2], destination.id, destination.id);
        moveTask.run(destination.id, moveMatch[2], destination.id, moveMatch[2], project.id);
      });
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const taskRenameMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
    if (req.method === 'POST' && taskRenameMatch) {
      const project = findProject.get(taskRenameMatch[1]);
      if (!project || !findTask.get(taskRenameMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const title = (body.get('title') || '').trim();
      if (!title) return html(res, 422, projectPage(project, filter, 'Task title is required', priority));
      renameTask.run(title, taskRenameMatch[2], project.id);
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const taskMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (req.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      if (taskMatch[2]) {
        const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
        if (!result.changes) return html(res, 404, page('<h1>Task not found</h1>'));
      } else {
        const title = (body.get('title') || '').trim();
        if (!title) return html(res, 422, projectPage(project, filter, 'Task title is required', priority));
        transaction(() => {
          const result = createTask.run(project.id, title, project.default_priority, project.id);
          rememberPosition.run(result.lastInsertRowid, project.id, project.id);
        });
      }
      return redirectProject(res, project, filter, priority, req.appliedDueRange);
    }
    const match = url.pathname.match(/^\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) return html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
    }
    html(res, 404, page('<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, error.status || 500, page(`<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
