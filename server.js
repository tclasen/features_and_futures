import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
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
`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Positions remain reserved even while a task belongs to another project.
db.exec(`
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
function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const validProjectFilter = value => value === 'Archived' ? 'Archived' : 'Active';
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const listDirectoryTasks = db.prepare(`
  SELECT t.*, p.name AS project_name FROM projects p JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? ORDER BY p.id ASC, t.position ASC, t.id ASC
`);
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const rememberedPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
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
function createTask(projectId, title, priority) {
  transaction(() => {
    const { position } = nextPosition.get(projectId);
    const result = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(result.lastInsertRowid, projectId, position);
  });
}
function validPortableProject(document) {
  if (!document || document.format !== 'workboard-project' || document.version !== 1) return false;
  const project = document.project;
  const nonblank = value => typeof value === 'string' && value.trim().length > 0;
  if (!project || !nonblank(project.name) || typeof project.archived !== 'boolean' ||
      !priorities.includes(project.defaultPriority) || !Array.isArray(project.tasks)) return false;
  return project.tasks.every(task => task && nonblank(task.title) &&
    typeof task.completed === 'boolean' && priorities.includes(task.priority) &&
    typeof task.dueDate === 'string' && (task.dueDate === '' || validDueDate(task.dueDate)) &&
    typeof task.notes === 'string' && typeof task.deleted === 'boolean');
}
const insertImportedProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const insertImportedTask = db.prepare(`INSERT INTO tasks
  (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
function importProject(name, project) {
  let projectId;
  transaction(() => {
    projectId = insertImportedProject.run(name, Number(project.archived), project.defaultPriority).lastInsertRowid;
    project.tasks.forEach((task, index) => {
      const position = index + 1;
      const result = insertImportedTask.run(projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), position);
      rememberPosition.run(result.lastInsertRowid, projectId, position);
    });
  });
  return projectId;
}
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id ASC');
const updateTaskProject = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
function moveTask(destinationId, taskId, sourceId) {
  transaction(() => {
    let saved = rememberedPosition.get(taskId, destinationId);
    if (!saved) {
      saved = nextPosition.get(destinationId);
      rememberPosition.run(taskId, destinationId, saved.position);
    }
    updateTaskProject.run(destinationId, saved.position, taskId, sourceId);
  });
}
const completeTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const taskFilters = ['All', 'Open', 'Completed', 'Deleted'];
const validFilter = value => taskFilters.includes(value) ? value : 'All';
const validPriorityFilter = value => priorities.includes(value) ? value : 'All';
const emptyRange = { from: '', through: '' };
const rangeError = ({ from, through }) =>
  (from && !validDueDate(from)) || (through && !validDueDate(through))
    ? 'Due range must use valid YYYY-MM-DD dates'
    : from && through && from > through ? 'Due from must not be after Due through' : '';
function readRange(params, prefix = 'due') {
  const range = {
    from: (params.get(`${prefix}From`) || '').trim(),
    through: (params.get(`${prefix}Through`) || '').trim()
  };
  return rangeError(range) ? emptyRange : range;
}
const searchQuery = params => (params.get('search') || '').trim();
const asciiLower = value => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
// Normalize only for matching; stored and displayed text remains untouched.
const normalizeSearch = value => asciiLower(value).replace(/[ \t]+/g, ' ');
const matchesSearch = (value, query) => normalizeSearch(value).includes(normalizeSearch(query));
const searchField = query => `<input type="hidden" name="search" value="${escapeHtml(query)}">`;
const projectsLocation = (filter, query) => query
  ? `/?filter=${filter}&search=${encodeURIComponent(query)}`
  : filter === 'Archived' ? '/?filter=Archived' : '/';
const buildProjectLocation = (id, filter, priorityFilter, range = emptyRange, query = '') =>
  `/projects/${id}?filter=${filter}${priorityFilter === 'All' ? '' : `&priorityFilter=${priorityFilter}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}${query ? `&search=${encodeURIComponent(query)}` : ''}`;

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17263b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 48px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, textarea { font: inherit; padding: 10px; width: 100%; border: 1px solid #8391a5; border-radius: 6px; }
    button { font: inherit; cursor: pointer; padding: 10px 16px; border: 1px solid #245ac7; border-radius: 6px; background: #245ac7; color: white; }
    select { font: inherit; padding: 8px; margin-bottom: 16px; }
    input[type=checkbox] { width: 22px; height: 22px; }
    input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #c07800; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid #dce2eb; padding: 16px 0; }
    .row span { overflow-wrap: anywhere; min-width: 0; }
    .row form { flex-shrink: 0; }
    .task-controls { display: contents; }
    [role=alert] { padding: 12px; color: #9a1925; background: #fff0f1; border-radius: 6px; margin-bottom: 16px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .row { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active', query = '', importJson = '', importName = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0).filter(project => matchesSearch(project.name, query));
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form class="create" method="post" action="/projects">
      ${searchField(query)}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <h2>Import project</h2>
    <form class="create" method="post" action="/projects/import">
      ${searchField(query)}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json" rows="8">\n${escapeHtml(importJson)}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <input id="imported-project-name" name="name" type="text" value="${escapeHtml(importName)}">
      <button type="submit">Import project</button>
    </form>
    <h2>Projects</h2>
    <form method="get" action="/">
      ${searchField(query)}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.submit()">
        ${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search projects</button>
    </form>
    ${projects.length ? projects.map(project => `
      <div class="row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          ${searchField(query)}
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('') : '<p>No projects yet.</p>'}
  `);
}

function matchesTask(task, filter, priorityFilter, range, query) {
  return matchesSearch(task.title, query) &&
    (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priorityFilter === 'All' || task.priority === priorityFilter) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through)));
}

function directoryPage(scope, filter, priorityFilter, range, query, error = '', draft = range) {
  const tasks = listDirectoryTasks.all(scope === 'Archived' ? 1 : 0)
    .filter(task => matchesTask(task, filter, priorityFilter, range, query));
  const filterFields = `<input type="hidden" name="scope" value="${scope}">
    <input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priorityFilter}">`;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const options = (values, selected) => values.map(value =>
    `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  return page('Task directory', `
    <h1>Task directory</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="get" action="/directory">
      ${searchField(query)}${rangeFields}
      <label for="project-scope">Project scope</label>
      <select id="project-scope" name="scope" onchange="this.form.requestSubmit()">${options(['Active', 'Archived'], scope)}</select>
      <label for="directory-task-filter">Task filter</label>
      <select id="directory-task-filter" name="filter" onchange="this.form.requestSubmit()">${options(taskFilters, filter)}</select>
      <label for="directory-priority-filter">Priority filter</label>
      <select id="directory-priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">${options(['All', ...priorities], priorityFilter)}</select>
    </form>
    <form method="get" action="/directory">
      ${filterFields}${rangeFields}
      <label for="directory-search">Directory search</label>
      <input id="directory-search" type="text" name="search" value="${escapeHtml(query)}">
      <button type="submit">Search directory</button>
    </form>
    <form method="get" action="/directory/due-range">
      ${filterFields}${searchField(query)}
      <input type="hidden" name="appliedFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="appliedThrough" value="${escapeHtml(range.through)}">
      <label for="directory-due-from">Due from</label>
      <input id="directory-due-from" type="text" name="dueFrom" value="${escapeHtml(draft.from)}">
      <label for="directory-due-through">Due through</label>
      <input id="directory-due-through" type="text" name="dueThrough" value="${escapeHtml(draft.through)}">
      <button type="submit">Apply due range</button>
    </form>
    ${['complete', 'reopen'].map(action => `
      <form method="post" action="/directory/${action}">
        ${filterFields}${rangeFields}${searchField(query)}
        <button type="submit"${scope === 'Archived' || filter === 'Deleted' ||
          !tasks.some(task => Boolean(task.completed) === (action === 'reopen')) ? ' disabled' : ''}>${action === 'complete' ? 'Complete visible tasks' : 'Reopen visible tasks'}</button>
      </form>`).join('')}
    ${tasks.length ? tasks.map(task => `
      <div class="row" data-testid="directory-task-row">
        <span data-testid="directory-task-title" style="white-space: pre-wrap">${escapeHtml(task.title)}</span>
        <span data-testid="directory-project-name" style="white-space: pre-wrap">${escapeHtml(task.project_name)}</span>
        <span data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</span>
        <span data-testid="directory-task-priority">${escapeHtml(task.priority)}</span>
        <span data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</span>
        <span data-testid="directory-task-notes" style="white-space: pre-wrap">${escapeHtml(task.notes)}</span>
        <form method="get" action="/projects/${task.project_id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p role="status">No matching tasks</p>'}
    <script>
      // Hide stale empty-result feedback while a native form navigation resolves.
      document.addEventListener('submit', () => {
        const announcement = document.querySelector('[role="status"]');
        if (announcement) announcement.hidden = true;
      });
      window.addEventListener('pageshow', () => {
        const announcement = document.querySelector('[role="status"]');
        if (announcement) announcement.hidden = false;
      });
    </script>
  `);
}

function renderProjectPage(project, filter = 'All', error = '', priorityFilter = 'All', range = emptyRange, draft = range, query = '') {
  const rangeFields = `${searchField(query)}<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}"><input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const eligibleProjects = destinations.all(project.id);
  const moveDisabled = project.archived || !eligibleProjects.length;
  const tasks = listTasks.all(project.id).filter(task => matchesTask(task, filter, priorityFilter, range, query));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form method="get" action="/projects/${project.id}/download"><button type="submit">Download project</button></form>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <h2>Tasks</h2>
    <form method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
        ${priorities.map(value => `<option${value === project.default_priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form method="get" action="/projects/${project.id}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.submit()">
        ${taskFilters.map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.submit()">
        ${['All', ...priorities].map(value => `<option${value === priorityFilter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search tasks</button>
    </form>
    <form method="get" action="/projects/${project.id}/due-range">
      ${searchField(query)}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <input type="hidden" name="appliedFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="appliedThrough" value="${escapeHtml(range.through)}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="dueFrom" type="text" value="${escapeHtml(draft.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="dueThrough" type="text" value="${escapeHtml(draft.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? tasks.map(task => `
      <div class="row" data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <fieldset class="task-controls"${project.archived || task.deleted ? ' disabled' : ''}>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
            ${priorities.map(value => `<option${value === task.priority ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived ? ' disabled' : ''}>
${escapeHtml(task.notes)}</textarea>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save notes</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${eligibleProjects.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        </fieldset>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </div>`).join('') : '<p>No matching tasks.</p>'}
  `);
}

async function parseFormBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    // Carry the applied range through every render and redirect in this request.
    // Form drafts are separate, so an invalid application cannot change membership.
    let appliedRange = readRange(url.searchParams);
    let appliedQuery = searchQuery(url.searchParams);
    const formBody = async request => {
      const body = await parseFormBody(request);
      appliedRange = readRange(body);
      appliedQuery = searchQuery(body);
      return body;
    };
    const projectPage = (project, filter, error, priorityFilter, range = appliedRange, draft = range) =>
      renderProjectPage(project, filter, error, priorityFilter, range, draft, appliedQuery);
    const projectLocation = (id, filter, priorityFilter, range = appliedRange) =>
      buildProjectLocation(id, filter, priorityFilter, range, appliedQuery);
    // Deleted tasks are readable only, even when a client posts directly.
    if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+(?:\/[^/]+)?$/.test(path)) {
      const [, , projectId, , taskId, action] = path.split('/');
      const task = findTask.get(taskId, projectId);
      if (task?.deleted && !['delete', 'restore'].includes(action)) {
        const body = await formBody(req);
        html(res, 403, projectPage(findProject.get(projectId), validFilter(body.get('filter')),
          'Deleted task is read-only', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
    }
    if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/(delete|restore)$/.test(path)) {
      const [, , projectId, , taskId, action] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', priorityFilter));
        return;
      }
      setTaskDeleted.run(action === 'delete' ? 1 : 0, taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter) });
      res.end();
    } else if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'POST' && ['/directory/complete', '/directory/reopen'].includes(path)) {
      const body = await formBody(req);
      const scope = validProjectFilter(body.get('scope'));
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      const completed = path === '/directory/complete' ? 1 : 0;
      // Resolve matching ownership and state from saved data, never from client IDs.
      // Selection and updates share a transaction; archived/deleted tasks are excluded.
      if (scope === 'Active' && filter !== 'Deleted') {
        transaction(() => {
          const tasks = listDirectoryTasks.all(0).filter(task =>
            matchesTask(task, filter, priorityFilter, appliedRange, appliedQuery) && task.completed !== completed);
          for (const task of tasks) completeTask.run(completed, task.id, task.project_id);
        });
      }
      const params = new URLSearchParams({ scope, filter, priorityFilter,
        dueFrom: appliedRange.from, dueThrough: appliedRange.through, search: appliedQuery });
      res.writeHead(303, { Location: `/directory?${params}` });
      res.end();
    } else if (req.method === 'GET' && (path === '/directory' || path === '/directory/due-range')) {
      const params = url.searchParams;
      const scope = validProjectFilter(params.get('scope'));
      const filter = validFilter(params.get('filter'));
      const priorityFilter = validPriorityFilter(params.get('priorityFilter'));
      const draft = { from: (params.get('dueFrom') || '').trim(), through: (params.get('dueThrough') || '').trim() };
      const error = path === '/directory/due-range' ? rangeError(draft) : '';
      const range = error ? readRange(params, 'applied') : appliedRange;
      html(res, error ? 422 : 200, directoryPage(scope, filter, priorityFilter, range, appliedQuery, error, error ? draft : range));
    } else if (req.method === 'GET' && path === '/') {
      html(res, 200, projectsPage('', validProjectFilter(url.searchParams.get('filter')), appliedQuery));
    } else if (req.method === 'POST' && path === '/projects/import') {
      const body = await formBody(req);
      const json = body.get('json') || '';
      const override = body.get('name') || '';
      const name = override.trim();
      const reject = error => html(res, 422, projectsPage(error,
        validProjectFilter(body.get('filter')), appliedQuery, json, override));
      if (!name) {
        reject('Project name is required');
        return;
      }
      let document;
      try { document = JSON.parse(json); } catch { /* Invalid input has no side effects. */ }
      if (!validPortableProject(document)) {
        reject('Invalid project JSON');
        return;
      }
      const id = importProject(name, document.project);
      res.writeHead(303, { Location: `/projects/${id}` });
      res.end();
    } else if (req.method === 'POST' && path === '/projects') {
      const body = await formBody(req);
      const name = (body.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required', validProjectFilter(body.get('filter')), appliedQuery));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: projectsLocation(validProjectFilter(body.get('filter')), appliedQuery) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(path)) {
      const [, , projectId, action] = path.split('/');
      if (!findProject.get(projectId)) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      await formBody(req);
      archiveProject.run(action === 'archive' ? 1 : 0, projectId);
      res.writeHead(303, { Location: projectsLocation(action === 'archive' ? 'Active' : 'Archived', appliedQuery) });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+\/download$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
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
            // HTML textareas normalize line breaks; export without modifying storage.
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted)
          }))
        }
      };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(document, null, 2));
    } else if (req.method === 'GET' && /^\/projects\/\d+\/due-range$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const draft = {
        from: (url.searchParams.get('dueFrom') || '').trim(),
        through: (url.searchParams.get('dueThrough') || '').trim()
      };
      const error = rangeError(draft);
      const filter = validFilter(url.searchParams.get('filter'));
      const priorityFilter = validPriorityFilter(url.searchParams.get('priorityFilter'));
      if (error) {
        html(res, 422, projectPage(project, filter, error, priorityFilter, readRange(url.searchParams, 'applied'), draft));
      } else {
        res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter, draft) });
        res.end();
      }
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, projectPage(project, validFilter(url.searchParams.get('filter')), '', validPriorityFilter(url.searchParams.get('priorityFilter')), readRange(url.searchParams)));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', priorityFilter));
        return;
      }
      const priority = body.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Invalid task priority', priorityFilter));
        return;
      }
      setDefaultPriority.run(priority, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      const name = (body.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectPage(project, filter, 'Project name is required', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      renameProject.run(name, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, validPriorityFilter(body.get('priorityFilter'))) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/move$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', priorityFilter));
        return;
      }
      const destination = destinations.all(project.id).find(item => String(item.id) === body.get('destination'));
      if (!destination) {
        html(res, 422, projectPage(project, filter, 'Choose an active destination project', priorityFilter));
        return;
      }
      moveTask(destination.id, taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/notes$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', priorityFilter));
        return;
      }
      setTaskNotes.run(body.get('notes') || '', taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/due-date$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      const priorityFilter = validPriorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', priorityFilter));
        return;
      }
      const dueDate = (body.get('dueDate') || '').trim();
      if (dueDate && !validDueDate(dueDate)) {
        html(res, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priorityFilter));
        return;
      }
      setTaskDueDate.run(dueDate, taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/priority$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      const priority = body.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Invalid task priority', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      setTaskPriority.run(priority, taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, validPriorityFilter(body.get('priorityFilter'))) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/rename$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project || !findTask.get(taskId, projectId)) {
        html(res, 404, page('Not found', '<h1>Task not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      const title = (body.get('title') || '').trim();
      if (!title) {
        html(res, 422, projectPage(project, filter, 'Task title is required', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      renameTask.run(title, taskId, project.id);
      res.writeHead(303, { Location: projectLocation(project.id, filter, validPriorityFilter(body.get('priorityFilter'))) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await formBody(req);
      const filter = validFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project is read-only', validPriorityFilter(body.get('priorityFilter'))));
        return;
      }
      if (taskId) {
        const result = completeTask.run(body.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          html(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (body.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, filter, 'Task title is required', validPriorityFilter(body.get('priorityFilter'))));
          return;
        }
        createTask(project.id, title, project.default_priority);
      }
      res.writeHead(303, { Location: projectLocation(project.id, filter, validPriorityFilter(body.get('priorityFilter'))) });
      res.end();
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
