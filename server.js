import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
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
// Upgrade databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing projects start with Normal without changing their existing tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Existing tasks retain their original Normal priority on migration.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// A missing due date is represented by an empty string, including on migration.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Notes are plain text; upgrades leave all existing task fields untouched.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Soft deletion leaves saved fields and remembered positions intact.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// IDs retain identity; sort_order records creation and subsequent move order.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET sort_order = id');
}
// Remember positions even while tasks belong to a different project.
// Seed current memberships from the previous ordering without rearranging tasks.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, sort_order FROM tasks;
`);
const priorities = ['Low', 'Normal', 'High'];
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT OR IGNORE INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const getPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const getOwnedTask = db.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const relocateTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');

function transaction(operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  return transaction(() => {
    const { position } = nextPosition.get(projectId);
    const result = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(result.lastInsertRowid, projectId, position);
    return result;
  });
}

function moveTask(destinationId, taskId, sourceId) {
  return transaction(() => {
    if (!getOwnedTask.get(taskId, sourceId)) return { changes: 0 };
    const remembered = getPosition.get(taskId, destinationId);
    const position = remembered?.position ?? nextPosition.get(destinationId).position;
    if (!remembered) rememberPosition.run(taskId, destinationId, position);
    return relocateTask.run(destinationId, position, taskId, sourceId);
  });
}
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (value === '') return true;
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function validProjectDocument(document) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nonblank = (value) => typeof value === 'string' && value.trim() !== '';
  if (!object(document) || document.format !== 'workboard-project' || document.version !== 1) return false;
  const project = document.project;
  return object(project) && nonblank(project.name) && typeof project.archived === 'boolean'
    && priorities.includes(project.defaultPriority) && Array.isArray(project.tasks)
    && project.tasks.every((task) => object(task) && nonblank(task.title)
      && typeof task.completed === 'boolean' && priorities.includes(task.priority)
      && typeof task.dueDate === 'string' && validDueDate(task.dueDate)
      && typeof task.notes === 'string' && typeof task.deleted === 'boolean');
}

const insertImportedProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const insertImportedTask = db.prepare(`
  INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function importProject(name, project) {
  return transaction(() => {
    const projectId = insertImportedProject.run(name, Number(project.archived), project.defaultPriority).lastInsertRowid;
    project.tasks.forEach((task, index) => {
      const position = index + 1;
      const taskId = insertImportedTask.run(projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), position).lastInsertRowid;
      rememberPosition.run(taskId, projectId, position);
    });
    return projectId;
  });
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
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #18243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border: 1px solid #dce2ed; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, textarea { width: 100%; padding: 10px; border: 1px solid #8895aa; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244bb5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #183987; }
    button:disabled { background: #8895aa; cursor: not-allowed; }
    .project { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #bb7c00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks { margin-top: 28px; }
    .task { border-top: 1px solid #dce2ed; padding: 16px 0; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    input[type="checkbox"] { width: auto; flex-shrink: 0; }
    select { padding: 10px; font: inherit; }
    .filter, .task-create { margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #dce2ed; padding: 16px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { padding: 12px; background: #fff0ef; color: #95231b; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

// Normalize only for matching; saved names/titles keep their original spacing and case.
function matchesSearch(value, query) {
  const normalize = (text) => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function searchQuery(params) {
  return (params.get('search') || '').trim();
}

function projectsLocation(filter, query) {
  return `/?${new URLSearchParams({ filter, search: query })}`;
}

function projectsPage(error = '', filter = 'Active', query = '', importValues = {}) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter((project) => matchesSearch(project.name, query));
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(query)}">`;
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField}
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="create" method="post" action="/projects/import">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField}
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json" rows="6">
${escapeHtml(importValues.json || '')}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <input id="imported-project-name" name="name" type="text" value="${escapeHtml(importValues.name || '')}">
      <button type="submit">Import project</button>
    </form>
    <form class="filter" method="get" action="/">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search projects</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <input type="hidden" name="filter" value="${filter}">
          ${searchField}
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
      ${projects.length ? '' : '<p>No projects yet.</p>'}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function rangeError(range) {
  if (!validDueDate(range.from) || !validDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

function appliedRange(params) {
  const range = {
    from: (params.get('dueFrom') || '').trim(),
    through: (params.get('dueThrough') || '').trim(),
  };
  return rangeError(range) ? { from: '', through: '' } : range;
}

function projectLocation(projectId, filter, priority, range, query = '') {
  let location = `/projects/${projectId}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
  if (range?.from) location += `&dueFrom=${range.from}`;
  if (range?.through) location += `&dueThrough=${range.through}`;
  if (query) location += `&search=${encodeURIComponent(query)}`;
  return location;
}

function matchesTask(task, filter, priority, range, query) {
  return matchesSearch(task.title, query) &&
    (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through)));
}

const directoryOrders = ['Original', 'Priority', 'Due date', 'Title'];

function directoryOrder(value) {
  return directoryOrders.includes(value) ? value : 'Original';
}

// Compare code points, not UTF-16 code units or locale-dependent collation.
function compareTitles(left, right) {
  const fold = (title) => Array.from(title.replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
    (character) => character.codePointAt(0));
  const a = fold(left), b = fold(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function orderDirectory(results, order) {
  // Stable sort retains Original order for ties; this never writes saved positions.
  return results.sort(({ task: a }, { task: b }) => {
    if (order === 'Priority') return priorities.indexOf(b.priority) - priorities.indexOf(a.priority);
    if (order === 'Due date') {
      if (!a.due_date || !b.due_date) return Number(!a.due_date) - Number(!b.due_date);
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    }
    return order === 'Title' ? compareTitles(a.title, b.title) : 0;
  });
}

function directoryLocation(scope, filter, priority, range, query, order = 'Original') {
  return `/directory?${new URLSearchParams({ scope, filter, priorityFilter: priority,
    dueFrom: range.from, dueThrough: range.through, search: query, order })}`;
}

function directoryTasks(scope, filter, priority, range, query) {
  return listProjects.all(scope === 'Archived' ? 1 : 0).flatMap((project) =>
    listTasks.all(project.id)
      .filter((task) => matchesTask(task, filter, priority, range, query))
      .map((task) => ({ project, task })));
}

function directoryPage(scope = 'Active', filter = 'All', priority = 'All', range = { from: '', through: '' }, query = '', error = '', draft = range, order = 'Original') {
  const results = orderDirectory(directoryTasks(scope, filter, priority, range, query), order);
  const canUpdate = scope === 'Active' && filter !== 'Deleted';
  const canComplete = canUpdate && results.some(({ task }) => !task.completed);
  const canReopen = canUpdate && results.some(({ task }) => task.completed);
  const rows = results.map(({ project, task }) => `<div class="task" data-testid="directory-task-row">
      <div data-testid="directory-task-title">${escapeHtml(task.title)}</div>
      <div data-testid="directory-project-name">${escapeHtml(project.name)}</div>
      <div data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</div>
      <div data-testid="directory-task-priority">${escapeHtml(task.priority)}</div>
      <div data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</div>
      <div data-testid="directory-task-notes" style="white-space: pre-wrap">${escapeHtml(task.notes)}</div>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`);
  const hidden = (name, value) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  const rangeFields = hidden('dueFrom', range.from) + hidden('dueThrough', range.through);
  const selections = hidden('scope', scope) + hidden('filter', filter) + hidden('priorityFilter', priority) + hidden('order', order);
  const select = (id, label, name, options, selected) => `<label for="${id}">${label}</label>
    <select id="${id}" name="${name}" onchange="this.form.requestSubmit()">
      ${options.map((option) => `<option${selected === option ? ' selected' : ''}>${option}</option>`).join('')}
    </select>`;
  return page('Task directory', `
    <h1>Task directory</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="filter" method="get" action="/directory">
      ${rangeFields}${hidden('search', query)}
      ${select('project-scope', 'Project scope', 'scope', ['Active', 'Archived'], scope)}
      ${select('task-filter', 'Task filter', 'filter', ['All', 'Open', 'Completed', 'Deleted'], filter)}
      ${select('priority-filter', 'Priority filter', 'priorityFilter', ['All', ...priorities], priority)}
      ${select('directory-order', 'Directory order', 'order', directoryOrders, order)}
    </form>
    <form class="filter" method="post" action="/directory/due-range">
      ${selections}${rangeFields}${hidden('search', query)}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(draft.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(draft.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" method="get" action="/directory">
      ${selections}${rangeFields}
      <label for="directory-search">Directory search</label>
      <input id="directory-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search directory</button>
    </form>
    <form class="filter" method="post" action="/directory/completion">
      ${selections}${rangeFields}${hidden('search', query)}
      <button type="submit" name="completed" value="true"${canComplete ? '' : ' disabled'}>Complete visible tasks</button>
      <button type="submit" name="completed" value="false"${canReopen ? '' : ' disabled'}>Reopen visible tasks</button>
    </form>
    <section class="tasks" aria-label="Directory tasks">
      ${rows.join('')}${rows.length ? '' : '<p role="status">No matching tasks</p>'}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, draft = range, query = '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(query)}">`;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
    <input type="hidden" name="dueThrough" value="${range.through}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}${searchField}`;
  const destinations = listProjects.all(0).filter((destination) => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter((task) => matchesTask(task, filter, priority, range, query));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form method="get" action="/projects/${project.id}/export"><button type="submit">Download project</button></form>
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
        ${priorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create task-create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields}${searchField}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(draft.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(draft.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search tasks</button>
    </form>
    <section class="tasks" aria-label="Tasks">
      ${tasks.map((task) => {
        const disabled = project.archived || task.deleted ? ' disabled' : '';
        return `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${disabled} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${disabled}>
          <button type="submit"${disabled}>Rename task</button>
        </form>
        <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${disabled} onchange="this.form.requestSubmit()">
            ${priorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${disabled}>
          <button type="submit"${disabled}>Save due date</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
          ${filterFields}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${disabled}>
${escapeHtml(task.notes)}</textarea>
          <button type="submit"${disabled}>Save notes</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
          ${filterFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </div>`;
      }).join('')}
      ${tasks.length ? '' : '<p>No tasks to show.</p>'}
    </section>`);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
}

async function readForm(request, maxSize = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > maxSize) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/directory') {
      html(response, 200, directoryPage(projectFilter(url.searchParams.get('scope')),
        taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')),
        appliedRange(url.searchParams), searchQuery(url.searchParams), '', undefined,
        directoryOrder(url.searchParams.get('order'))));
    } else if (request.method === 'POST' && url.pathname === '/directory/completion') {
      const form = await readForm(request);
      const scope = projectFilter(form.get('scope'));
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      const query = searchQuery(form);
      const completed = form.get('completed');
      if (scope === 'Active' && filter !== 'Deleted' && ['true', 'false'].includes(completed)) {
        transaction(() => {
          const value = Number(completed === 'true');
          for (const { project, task } of directoryTasks(scope, filter, priority, range, query)) {
            if (task.completed !== value) updateTask.run(value, task.id, project.id);
          }
        });
      }
      response.writeHead(303, { Location: directoryLocation(scope, filter, priority, range, query, directoryOrder(form.get('order'))) });
      response.end();
    } else if (request.method === 'POST' && url.pathname === '/directory/due-range') {
      const form = await readForm(request);
      const scope = projectFilter(form.get('scope'));
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const query = searchQuery(form);
      const draft = { from: (form.get('from') || '').trim(), through: (form.get('through') || '').trim() };
      const error = rangeError(draft);
      if (error) {
        html(response, 400, directoryPage(scope, filter, priority, appliedRange(form), query, error, draft, directoryOrder(form.get('order'))));
      } else {
        response.writeHead(303, { Location: directoryLocation(scope, filter, priority, draft, query, directoryOrder(form.get('order'))) });
        response.end();
      }
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
    } else if (request.method === 'POST' && url.pathname === '/projects/import') {
      const form = await readForm(request, Infinity);
      const values = { json: form.get('json') || '', name: form.get('name') || '' };
      const name = values.name.trim();
      let document;
      try { document = JSON.parse(values.json); } catch { /* Invalid JSON is reported below. */ }
      const error = !name ? 'Project name is required'
        : !validProjectDocument(document) ? 'Invalid project JSON' : '';
      if (error) {
        html(response, 400, projectsPage(error, projectFilter(form.get('filter')), searchQuery(form), values));
        return;
      }
      const projectId = importProject(name, document.project);
      response.writeHead(303, { Location: `/projects/${projectId}` });
      response.end();
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const filter = projectFilter(form.get('filter'));
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required', filter, searchQuery(form)));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: projectsLocation(filter, searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const form = await readForm(request);
      const result = setProjectArchived.run(action === 'archive' ? 1 : 0, projectId);
      if (!result.changes) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      response.writeHead(303, { Location: projectsLocation(projectFilter(form.get('filter') || (action === 'archive' ? 'Active' : 'Archived')), searchQuery(form)) });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*\/export$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(project.id).map((task) => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Normalize textarea line breaks only in the portable representation.
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
      response.end(JSON.stringify(document));
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedRange(url.searchParams), undefined, searchQuery(url.searchParams)));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/due-range$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = { from: (form.get('from') || '').trim(), through: (form.get('through') || '').trim() };
      const error = rangeError(range);
      if (error) {
        html(response, 400, projectPage(project, filter, error, priority, appliedRange(form), range, searchQuery(form)));
        return;
      }
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, range, searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority, appliedRange(form), undefined, searchQuery(form)));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!priorities.includes(defaultPriority)) {
        html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, appliedRange(form), undefined, searchQuery(form)));
        return;
      }
      setDefaultPriority.run(defaultPriority, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, appliedRange(form), searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority, appliedRange(form), undefined, searchQuery(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectPage(project, filter, 'Project name is required', priority, appliedRange(form), undefined, searchQuery(form)));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, appliedRange(form), searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*(?:\/(?:rename|priority|due-date|move|notes|delete|restore))?)?$/.test(url.pathname)) {
      const [, , projectId, , taskId, action] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const prioritySelection = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
        return;
      }
      if (taskId) {
        const task = getOwnedTask.get(taskId, projectId);
        if (!task) {
          html(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        if (task.deleted && action !== 'restore') {
          html(response, 403, projectPage(project, filter, 'Deleted tasks cannot be changed until restored', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
          return;
        }
        let result;
        if (action === 'delete' || action === 'restore') {
          result = setTaskDeleted.run(action === 'delete' ? 1 : 0, taskId, projectId);
        } else if (action === 'move') {
          const destinationId = form.get('destination');
          const destination = /^[1-9]\d*$/.test(destinationId || '') ? getProject.get(destinationId) : null;
          if (!destination || destination.archived || destination.id === project.id) {
            html(response, 400, projectPage(project, filter, 'Choose an active destination project', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
            return;
          }
          result = moveTask(destination.id, taskId, projectId);
        } else if (action === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
            return;
          }
          result = renameTask.run(title, taskId, projectId);
        } else if (action === 'notes') {
          result = setTaskNotes.run(form.get('notes') || '', taskId, projectId);
        } else if (action === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (!validDueDate(dueDate)) {
            html(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
            return;
          }
          result = setTaskDueDate.run(dueDate, taskId, projectId);
        } else if (action === 'priority') {
          const priority = form.get('priority');
          if (!priorities.includes(priority)) {
            html(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
            return;
          }
          result = setTaskPriority.run(priority, taskId, projectId);
        } else {
          result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        }
        if (!result.changes) {
          html(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, appliedRange(form), undefined, searchQuery(form)));
          return;
        }
        createTask(projectId, title, project.default_priority);
      }
      response.writeHead(303, { Location: projectLocation(projectId, filter, prioritySelection, appliedRange(form), searchQuery(form)) });
      response.end();
    } else {
      html(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    html(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
