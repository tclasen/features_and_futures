import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const completionScript = readFileSync(new URL('./completion.js', import.meta.url), 'utf8');

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep positions even while tasks are away, so returns never depend on move order.
// Seed the current positions when upgrading an existing database.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const listDirectoryTasks = db.prepare(`SELECT t.*, p.name AS project_name
  FROM tasks t JOIN projects p ON p.id = t.project_id
  WHERE p.archived = ? ORDER BY p.id, t.position, t.id`);
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const rememberedPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const updateTaskProject = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    work();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  transaction(() => {
    const { position } = nextPosition.get(projectId);
    const { lastInsertRowid } = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(lastInsertRowid, projectId, position);
  });
}

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

// Validate calendar components directly; dates are never converted to timestamps.
function validDueDate(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const priorities = ['Low', 'Normal', 'High'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblankString = (value) => typeof value === 'string' && value.trim().length > 0;

function validateProjectJSON(text) {
  let document;
  try { document = JSON.parse(text); } catch { return null; }
  if (!isObject(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!isObject(project) || !nonblankString(project.name) || typeof project.archived !== 'boolean' ||
      !priorities.includes(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  for (const task of project.tasks) {
    if (!isObject(task) || !nonblankString(task.title) || typeof task.completed !== 'boolean' ||
        !priorities.includes(task.priority) || typeof task.dueDate !== 'string' ||
        (task.dueDate !== '' && !validDueDate(task.dueDate)) || typeof task.notes !== 'string' ||
        typeof task.deleted !== 'boolean') return null;
  }
  return project;
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
      const taskId = insertImportedTask.run(projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), position).lastInsertRowid;
      rememberPosition.run(taskId, projectId, position);
    });
  });
  return projectId;
}

const taskFilter = (value) => ['Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
const priorityFilter = (value) => priorities.includes(value) ? value : 'All';
function dueRange(values) {
  const from = (values.get('dueFrom') || '').trim();
  const through = (values.get('dueThrough') || '').trim();
  if ((from && !validDueDate(from)) || (through && !validDueDate(through)) ||
      (from && through && from > through)) return { from: '', through: '' };
  return { from, through };
}

// Normalize only for matching; stored names/titles and displayed queries stay intact.
const searchQuery = (values) => (values.get('searchQuery') || '').trim();
const normalizeSearch = (value) => value.replace(/[ \t]+/g, ' ')
  .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const matchesSearch = (value, query) => normalizeSearch(value).includes(normalizeSearch(query));

const projectFilter = (value) => value === 'Archived' ? 'Archived' : 'Active';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172b42; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; letter-spacing: -1px; overflow-wrap: anywhere; }
    .intro { color: #526174; margin-bottom: 32px; }
    .panel, .project { background: white; border: 1px solid #dce2eb; border-radius: 12px; padding: 24px; }
    .rename { margin-bottom: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8492a6; border-radius: 6px; padding: 12px; font: inherit; }
    textarea { display: block; width: 100%; min-height: 110px; resize: vertical; border: 1px solid #8492a6; border-radius: 6px; padding: 12px; font: inherit; margin-bottom: 12px; }
    button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 12px 18px; background: #234fc4; color: white; cursor: pointer; }
    button:hover { background: #193c99; }
    button:disabled { background: #8492a6; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #b36b00; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .summary { color: #526174; margin: 8px 0 0; }
    .empty { color: #526174; }
    .filter { margin-top: 28px; }
    select { font: inherit; padding: 10px; border: 1px solid #8492a6; border-radius: 6px; background: white; }
    .task { background: white; border: 1px solid #dce2eb; border-radius: 12px; padding: 20px; }
    .task .completion-label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 20px; }
    [role="alert"] { color: #9c2222; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active', search = '', importDraft = { json: '', name: '', error: '' }) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0).filter((project) => matchesSearch(project.name, search));
  const searchField = `<input type="hidden" name="searchQuery" value="${escapeHtml(search)}">`;
  return page('Projects', `<h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    <form class="panel" method="post" action="/projects">
      ${searchField}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="panel filter" method="post" action="/projects/import">
      ${searchField}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json">\n${escapeHtml(importDraft.json)}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <div class="fields"><input id="imported-project-name" name="name" type="text" value="${escapeHtml(importDraft.name)}"><button type="submit">Import project</button></div>
      ${importDraft.error ? `<p role="alert">${escapeHtml(importDraft.error)}</p>` : ''}
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
      <div class="fields"><input id="project-search" name="searchQuery" type="text" value="${escapeHtml(search)}"><button type="submit">Search projects</button></div>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `<div class="project" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <p class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</p></div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">${searchField}<button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No active projects. Create a project above.'}</p>`}
    </section>`);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

function matchesTask(task, filter, priority, range, search) {
  return (
    (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priority === 'All' || task.priority === priority) &&
    matchesSearch(task.title, search) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
}

function directoryTasks(scope, filter, priority, range, search) {
  return listDirectoryTasks.all(scope === 'Archived' ? 1 : 0)
    .filter((task) => matchesTask(task, filter, priority, range, search));
}

const directoryOrders = ['Original', 'Priority', 'Due date', 'Title'];
const directoryOrder = (value) => directoryOrders.includes(value) ? value : 'Original';
const foldTitle = (title) => title.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function orderDirectoryTasks(tasks, order) {
  // Stable sorting preserves Original order for ties; these rows are view data only.
  if (order === 'Priority') {
    tasks.sort((a, b) => priorities.indexOf(b.priority) - priorities.indexOf(a.priority));
  } else if (order === 'Due date') {
    tasks.sort((a, b) => a.due_date === b.due_date ? 0 :
      !a.due_date ? 1 : !b.due_date ? -1 : a.due_date < b.due_date ? -1 : 1);
  } else if (order === 'Title') {
    tasks.sort((a, b) => compareCodePoints(foldTitle(a.title), foldTitle(b.title)));
  }
  return tasks;
}

function directoryPage(scope = 'Active', filter = 'All', priority = 'All', range = { from: '', through: '' }, search = '', error = '', draft = range, order = 'Original') {
  const tasks = directoryTasks(scope, filter, priority, range, search);
  orderDirectoryTasks(tasks, order);
  const bulkDisabled = scope === 'Archived' || filter === 'Deleted';
  const state = `<input type="hidden" name="scope" value="${scope}">
    <input type="hidden" name="order" value="${order}">
    <input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">
    <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
    <input type="hidden" name="searchQuery" value="${escapeHtml(search)}">`;
  return page('Task directory', `<form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>Task directory</h1>
    <form class="filter" method="get" action="/directory">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
      <input type="hidden" name="searchQuery" value="${escapeHtml(search)}">
      ${[
        ['Project scope', 'scope', scope, ['Active', 'Archived']],
        ['Task filter', 'filter', filter, ['All', 'Open', 'Completed', 'Deleted']],
        ['Priority filter', 'priorityFilter', priority, ['All', ...priorities]],
        ['Directory order', 'order', order, directoryOrders],
      ].map(([label, name, selected, options]) => `<label for="directory-${name}">${label}</label>
        <select id="directory-${name}" name="${name}" onchange="this.form.requestSubmit()">
          ${options.map((option) => `<option${selected === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>`).join('')}
    </form>
    <form class="filter" method="post" action="/directory/due-range">
      ${state}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(draft.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(draft.through)}">
      <button type="submit">Apply due range</button>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="filter" method="post" action="/directory/search">
      ${state}
      <label for="directory-search">Directory search</label>
      <div class="fields"><input id="directory-search" name="query" type="text" value="${escapeHtml(search)}"><button type="submit">Search directory</button></div>
    </form>
    <form class="filter" method="post" action="/directory/completion">
      ${state}
      <button type="submit" name="completed" value="1"${bulkDisabled || !tasks.some((task) => !task.completed) ? ' disabled' : ''}>Complete visible tasks</button>
      <button type="submit" name="completed" value="0"${bulkDisabled || !tasks.some((task) => task.completed) ? ' disabled' : ''}>Reopen visible tasks</button>
    </form>
    <section class="projects" aria-label="Directory tasks">
      ${tasks.length ? tasks.map((task) => `<div class="task" data-testid="directory-task-row">
        <h2 data-testid="directory-task-title" style="white-space: pre-wrap">${escapeHtml(task.title)}</h2>
        <p data-testid="directory-project-name" style="white-space: pre-wrap">${escapeHtml(task.project_name)}</p>
        <p data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</p>
        <p data-testid="directory-task-priority">${task.priority}</p>
        <p data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</p>
        <div data-testid="directory-task-notes" style="white-space: pre-wrap; overflow-wrap: anywhere">${escapeHtml(task.notes)}</div>
        <form method="get" action="/projects/${task.project_id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p class="empty" id="directory-empty" role="status">No matching tasks</p>'}
    </section>
    <script>
      // The next document announces emptiness only after its results are resolved.
      document.addEventListener('submit', () => {
        const empty = document.getElementById('directory-empty');
        if (empty) empty.hidden = true;
      });
    </script>`);
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null, priority = 'All', dueDateError = null, range = { from: '', through: '' }, rangeError = '', rangeDraft = range, search = '') {
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || !eligibleDestinations.length;
  const tasks = listTasks.all(project.id).filter((task) => matchesTask(task, filter, priority, range, search));
  const rangeFields = `<input type="hidden" name="searchQuery" value="${escapeHtml(search)}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  return page(project.name, `<form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/projects/${project.id}/download">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <button type="submit">Download project</button>
    </form>
    ${project.archived ? '<p class="intro">Archived project</p>' : ''}
    <form class="panel rename" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="new-project-name">New project name</label>
      <div class="fields"><input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
    </form>
    <form class="panel rename" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="panel" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="task-title">Task title</label>
      <div class="fields"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields}
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
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(rangeDraft.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(rangeDraft.through)}">
      <button type="submit">Apply due range</button>
      ${rangeError ? `<p role="alert">${escapeHtml(rangeError)}</p>` : ''}
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/search">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="task-search">Task search</label>
      <div class="fields"><input id="task-search" name="query" type="text" value="${escapeHtml(search)}"><button type="submit">Search tasks</button></div>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}" data-task-completion data-task-id="${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
          <label class="completion-label"><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="fields"><input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived || task.deleted ? ' disabled' : ''}><button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button></div>
          ${taskRenameError?.id === task.id ? `<p role="alert">${escapeHtml(taskRenameError.message)}</p>` : ''}
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
            ${eligibleDestinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="fields"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived || task.deleted ? ' disabled' : ''}><button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button></div>
          ${dueDateError?.id === task.id ? `<p role="alert">${escapeHtml(dueDateError.message)}</p>` : ''}
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes"${project.archived || task.deleted ? ' disabled' : ''}>
${escapeHtml(task.notes)}</textarea>
          <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>
    <script src="/completion.js" defer></script>`);
}

async function readForm(req, maxBytes = 65536) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function projectLocation(id, filter, priority, range = { from: '', through: '' }, search = '') {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (search) query.set('searchQuery', search);
  return `/projects/${id}${query.size ? `?${query}` : ''}`;
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    // Deleted tasks are readable but cannot be edited or moved, including by direct requests.
    const taskEdit = path.match(/^\/projects\/(\d+)\/tasks\/(\d+)(?:\/(move|notes|due-date|priority|rename))?$/);
    if (req.method === 'POST' && taskEdit) {
      const projectId = Number(taskEdit[1]);
      const taskId = Number(taskEdit[2]);
      const task = Number.isSafeInteger(projectId) && Number.isSafeInteger(taskId)
        ? findTask.get(taskId, projectId) : undefined;
      if (task?.deleted) {
        html(res, 409, page('Deleted task', '<h1>Restore task before editing</h1>'));
        return;
      }
    }
    if (req.method === 'GET' && path === '/completion.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(completionScript);
    } else if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && path === '/') {
      html(res, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
    } else if (req.method === 'GET' && path === '/directory') {
      html(res, 200, directoryPage(projectFilter(url.searchParams.get('scope')),
        taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')),
        dueRange(url.searchParams), searchQuery(url.searchParams), '', undefined,
        directoryOrder(url.searchParams.get('order'))));
    } else if (req.method === 'POST' && ['/directory/search', '/directory/due-range', '/directory/completion'].includes(path)) {
      const form = await readForm(req);
      const scope = projectFilter(form.get('scope'));
      const order = directoryOrder(form.get('order'));
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      let range = dueRange(form);
      let search = searchQuery(form);
      if (path === '/directory/search') {
        search = (form.get('query') || '').trim();
      } else if (path === '/directory/completion') {
        const completed = form.get('completed');
        if (scope === 'Active' && filter !== 'Deleted' && ['0', '1'].includes(completed)) {
          transaction(() => {
            for (const task of directoryTasks(scope, filter, priority, range, search)) {
              if (task.completed !== Number(completed)) {
                updateTask.run(Number(completed), task.id, task.project_id);
              }
            }
          });
        }
      } else {
        const draft = {
          from: (form.get('rangeFrom') || '').trim(),
          through: (form.get('rangeThrough') || '').trim(),
        };
        let error = '';
        if ((draft.from && !validDueDate(draft.from)) || (draft.through && !validDueDate(draft.through))) {
          error = 'Due range must use valid YYYY-MM-DD dates';
        } else if (draft.from && draft.through && draft.from > draft.through) {
          error = 'Due from must not be after Due through';
        }
        if (error) {
          html(res, 422, directoryPage(scope, filter, priority, range, search, error, draft, order));
          return;
        }
        range = draft;
      }
      const query = new URLSearchParams();
      if (scope !== 'Active') query.set('scope', scope);
      if (order !== 'Original') query.set('order', order);
      if (filter !== 'All') query.set('filter', filter);
      if (priority !== 'All') query.set('priorityFilter', priority);
      if (range.from) query.set('dueFrom', range.from);
      if (range.through) query.set('dueThrough', range.through);
      if (search) query.set('searchQuery', search);
      redirect(res, `/directory${query.size ? `?${query}` : ''}`);
    } else if (req.method === 'GET' && /^\/projects\/\d+\/download$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(id).map((task) => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Textarea line breaks are portable LF; the saved text remains untouched.
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted),
          })),
        },
      };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(document, null, 2));
    } else if (req.method === 'POST' && path === '/projects/import') {
      const form = await readForm(req, Infinity);
      const draft = { json: form.get('json') || '', name: form.get('name') || '', error: '' };
      const name = draft.name.trim();
      const project = name ? validateProjectJSON(draft.json) : null;
      if (!name || !project) {
        draft.error = name ? 'Invalid project JSON' : 'Project name is required';
        html(res, 422, projectsPage('', projectFilter(form.get('filter')), searchQuery(form), draft));
        return;
      }
      const id = importProject(name, project);
      redirect(res, `/projects/${id}`);
    } else if (req.method === 'POST' && path === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required', projectFilter(form.get('filter')), searchQuery(form)));
        return;
      }
      createProject.run(name);
      const query = new URLSearchParams();
      if (projectFilter(form.get('filter')) === 'Archived') query.set('filter', 'Archived');
      if (searchQuery(form)) query.set('searchQuery', searchQuery(form));
      redirect(res, query.size ? `/?${query}` : '/');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/search$/.test(path)) {
      const id = Number(path.split('/')[2]);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      redirect(res, projectLocation(id, taskFilter(form.get('filter')),
        priorityFilter(form.get('priorityFilter')), dueRange(form), (form.get('query') || '').trim()));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      const draft = {
        from: (form.get('rangeFrom') || '').trim(),
        through: (form.get('rangeThrough') || '').trim(),
      };
      let error = '';
      if ((draft.from && !validDueDate(draft.from)) || (draft.through && !validDueDate(draft.through))) {
        error = 'Due range must use valid YYYY-MM-DD dates';
      } else if (draft.from && draft.through && draft.from > draft.through) {
        error = 'Due from must not be after Due through';
      }
      if (error) {
        html(res, 422, projectPage(project, filter, '', '', null, selectedPriority, null, range, error, draft, search));
        return;
      }
      redirect(res, projectLocation(id, filter, selectedPriority, draft, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Task priority must be Low, Normal, or High', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      setDefaultPriority.run(priority, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, '', 'Archived project', null, selectedPriority, null, range, '', range, search));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectPage(project, filter, '', 'Project name is required', null, selectedPriority, null, range, '', range, search));
        return;
      }
      renameProject.run(name, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(path)) {
      const id = Number(path.split('/')[2]);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const search = searchQuery(form);
      const archived = path.endsWith('/archive');
      setProjectArchived.run(archived ? 1 : 0, id);
      const query = new URLSearchParams();
      if (!archived) query.set('filter', 'Archived');
      if (search) query.set('searchQuery', search);
      redirect(res, query.size ? `/?${query}` : '/');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/(delete|restore)$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project || !Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      // Keep ownership and all remembered positions; restoration only changes visibility.
      setTaskDeleted.run(path.endsWith('/delete') ? 1 : 0, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/move$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project || !Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      const destinationId = Number(form.get('destination'));
      const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
      if (project.archived || destination?.archived) {
        html(res, 409, projectPage(project, filter, 'Archived projects cannot move tasks', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      if (!destination || destinationId === id) {
        html(res, 422, projectPage(project, filter, 'Choose another active destination project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      moveTask(destinationId, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/notes$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project || !Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      setTaskNotes.run(form.get('notes') || '', taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/due-date$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      const dueDate = (form.get('dueDate') || '').trim();
      if (dueDate && !validDueDate(dueDate)) {
        html(res, 422, projectPage(project, filter, '', '', null, selectedPriority, {
          id: taskNumber, message: 'Due date must be a valid YYYY-MM-DD date',
        }, range, '', range, search));
        return;
      }
      setTaskDueDate.run(dueDate, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/priority$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Task priority must be Low, Normal, or High', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      setTaskPriority.run(priority, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/rename$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      const title = (form.get('title') || '').trim();
      if (!title) {
        html(res, 422, projectPage(project, filter, '', '', {
          id: taskNumber, message: 'Task title is required',
        }, selectedPriority, null, range, '', range, search));
        return;
      }
      renameTask.run(title, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const search = searchQuery(form);
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range, '', range, search));
        return;
      }
      if (taskId) {
        const taskNumber = Number(taskId);
        const result = Number.isSafeInteger(taskNumber)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskNumber, id)
          : { changes: 0 };
        if (!result.changes) {
          html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, filter, 'Task title is required', '', null, selectedPriority, null, range, '', range, search));
          return;
        }
        createTask(id, title, project.default_priority);
      }
      redirect(res, projectLocation(id, filter, selectedPriority, range, search));
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', null, priorityFilter(url.searchParams.get('priorityFilter')), null, dueRange(url.searchParams), '', dueRange(url.searchParams), searchQuery(url.searchParams)));
      } else {
        html(res, 404, page('Project not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
      }
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
