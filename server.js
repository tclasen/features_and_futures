import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, id);`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
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
  db.exec('BEGIN; ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id; COMMIT;');
}
// Keep vacated positions: returning tasks reuse them, while first arrivals append
// after every position ever established in the destination project.
db.exec(`BEGIN;
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS task_positions_project ON task_positions(project_id, position);
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;`);
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id ASC');
const rememberPosition = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?`);
function transaction(action) {
  db.exec('BEGIN');
  try {
    action();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const setDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const directoryTasks = db.prepare(`SELECT t.*, p.name AS project_name
  FROM projects p JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? ORDER BY p.id ASC, t.position ASC, t.id ASC`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6fa; color: #182339; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  input, textarea { width: 100%; padding: 10px; font: inherit; border: 1px solid #7c899f; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #2457b8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #19448f; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  :focus-visible { outline: 3px solid #b25d00; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  [role=alert] { color: #9d1829; background: #fff0f2; padding: 12px; border-radius: 6px; }
  .projects, .tasks, .create, .filter { margin-top: 32px; }
  select { padding: 10px; font: inherit; }
  .task { border-top: 1px solid #dce2eb; padding: 16px 0; }
  .task label { display: flex; gap: 12px; align-items: center; margin: 0; overflow-wrap: anywhere; }
  .task input[type=checkbox] { width: auto; flex-shrink: 0; }
  .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dce2eb; }
  .project span { overflow-wrap: anywhere; min-width: 0; }
  .project form { flex-shrink: 0; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
</style></head><body><main>${content}</main>
<script>
  // Preserve the current controls and DOM while saving completion. Replacing
  // main with a response snapshot can overwrite edits made while fetch runs.
  // Full-page directory requests resolve results on the server. Hide the old
  // empty announcement as soon as a new result request starts loading.
  document.addEventListener('submit', event => {
    if (new URL(event.target.action).pathname.startsWith('/directory')) {
      document.querySelector('[data-directory-empty]')?.remove();
    }
  });
  const completionSaves = new WeakMap();
  document.addEventListener('change', async event => {
    const checkbox = event.target;
    if (!checkbox.matches('input[data-save-completion]')) return;
    const form = checkbox.form;
    const row = checkbox.closest('[data-task-id]');
    const save = {};
    completionSaves.set(checkbox, save);
    const body = new URLSearchParams(new FormData(form));
    // A filtered-out checkbox must remain attached through the click action.
    const settled = new Promise(resolve => setTimeout(resolve, 150));
    try {
      const response = await fetch(form.action, {
        method: 'POST', body, keepalive: true, headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Completion save failed');
      const saved = await response.json();
      await settled;
      if (completionSaves.get(checkbox) !== save || !row.isConnected) return;
      const filter = document.querySelector('#task-filter').value;
      if ((filter === 'Open' && saved.completed) ||
          (filter === 'Completed' && !saved.completed)) row.remove();
    } catch (error) {
      if (completionSaves.get(checkbox) !== save || !row.isConnected) return;
      checkbox.checked = !checkbox.checked;
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Unable to save completion. Please try again.';
      document.querySelector('main').prepend(alert);
    }
  });
</script></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function searchQuery(value) {
  return (value || '').trim();
}

function matchesSearch(text, query) {
  // Normalize only for matching; saved text and the applied query stay intact.
  const fold = value => value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
  return fold(text).includes(fold(query));
}

function projectsPage(error = '', filter = 'Active', query = '', imported = { json: '', name: '' }) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, query));
  return page('Projects', `<h1>Workboard</h1>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="search" value="${escapeHtml(query)}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="create" method="post" action="/projects/import">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="search" value="${escapeHtml(query)}">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="projectJson" rows="8">${escapeHtml(imported.json).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <input id="imported-project-name" name="importedName" type="text" value="${escapeHtml(imported.name)}">
      <button type="submit">Import project</button>
    </form>
    <form class="filter" method="get" action="/">
      <input type="hidden" name="search" value="${escapeHtml(query)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search projects</button>
    </form>
    <section class="projects" aria-label="Projects">${projects.length ? projects.map(project => `
      <div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <input type="hidden" name="search" value="${escapeHtml(query)}">
          <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
        </form>
      </div>`).join('') : '<p>No projects yet.</p>'}</section>`);
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

function validateImport(json) {
  let document;
  try { document = JSON.parse(json); } catch { return null; }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nonblank = value => typeof value === 'string' && Boolean(value.trim());
  const priority = value => ['Low', 'Normal', 'High'].includes(value);
  if (!object(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!object(project) || !nonblank(project.name) || typeof project.archived !== 'boolean' ||
      !priority(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  for (const task of project.tasks) {
    if (!object(task) || !nonblank(task.title) || typeof task.completed !== 'boolean' ||
        !priority(task.priority) || typeof task.dueDate !== 'string' ||
        (task.dueDate !== '' && !validDueDate(task.dueDate)) || typeof task.notes !== 'string' ||
        typeof task.deleted !== 'boolean') return null;
  }
  return project;
}

const importProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const importTask = db.prepare(`INSERT INTO tasks
  (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

function dueRange(params) {
  // Applied search travels with the applied range through every task-page form.
  const search = searchQuery(params.get('search'));
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  if ((from && !validDueDate(from)) || (through && !validDueDate(through)) ||
      (from && through && from > through)) return { from: '', through: '', search };
  return { from, through, search };
}

function projectLocation(id, filter, priority, range) {
  const params = new URLSearchParams({ filter });
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.search) params.set('search', range.search);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  return `/projects/${id}?${params}`;
}

function matchesTask(task, filter, priority, range) {
  return matchesSearch(task.title, range.search || '') &&
    (filter === 'Deleted' ? Boolean(task.deleted) :
      !task.deleted && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through)));
}

function directoryOrder(value) {
  return ['Priority', 'Due date', 'Title'].includes(value) ? value : 'Original';
}

function compareDirectoryTasks(a, b, order) {
  if (order === 'Priority') {
    const rank = { High: 0, Normal: 1, Low: 2 };
    return rank[a.priority] - rank[b.priority];
  }
  if (order === 'Due date') {
    if (!a.due_date || !b.due_date) return Number(!a.due_date) - Number(!b.due_date);
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
  }
  if (order === 'Title') {
    const fold = title => Array.from(title.replace(/[A-Z]/g, letter => letter.toLowerCase()));
    const left = fold(a.title);
    const right = fold(b.title);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
      if (difference) return difference;
    }
    return left.length - right.length;
  }
  return 0;
}

function directoryLocation(scope, filter, priority, range, order = 'Original') {
  return '/directory?' + new URLSearchParams({ scope, filter, priorityFilter: priority,
    dueFrom: range.from, dueThrough: range.through, search: range.search || '', order });
}

function directoryPage(scope = 'Active', filter = 'All', priority = 'All', range = { from: '', through: '' }, error = '', order = 'Original') {
  const tasks = directoryTasks.all(scope === 'Archived' ? 1 : 0)
    .filter(task => matchesTask(task, filter, priority, range))
    // Stable sorting retains Original order for ties; only this view is sorted.
    .sort((a, b) => compareDirectoryTasks(a, b, order));
  const hidden = values => Object.entries(values).map(([name, value]) =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join('');
  const state = { scope, filter, priorityFilter: priority, order };
  const rangeState = { dueFrom: range.from, dueThrough: range.through, search: range.search || '' };
  const select = (id, label, name, options, value) => `<label for="${id}">${label}</label>
    <select id="${id}" name="${name}" onchange="this.form.requestSubmit()">${options.map(option =>
      `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}</select>`;
  return page('Task directory', `<h1>Task directory</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="filter" method="get" action="/directory">
      ${hidden(rangeState)}
      ${select('project-scope', 'Project scope', 'scope', ['Active', 'Archived'], scope)}
      ${select('task-filter', 'Task filter', 'filter', ['All', 'Open', 'Completed', 'Deleted'], filter)}
      ${select('priority-filter', 'Priority filter', 'priorityFilter', ['All', 'Low', 'Normal', 'High'], priority)}
      ${select('directory-order', 'Directory order', 'order', ['Original', 'Priority', 'Due date', 'Title'], order)}
    </form>
    <form class="filter" method="get" action="/directory">
      ${hidden({ ...state, dueFrom: range.from, dueThrough: range.through })}
      <label for="directory-search">Directory search</label>
      <input id="directory-search" name="search" type="text" value="${escapeHtml(range.search || '')}">
      <button type="submit">Search directory</button>
    </form>
    <form class="filter" method="post" action="/directory/due-range">
      ${hidden({ ...state, ...rangeState })}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" method="post" action="/directory/completion">
      ${hidden({ ...state, ...rangeState })}
      <button type="submit" name="completed" value="1"${scope === 'Archived' || filter === 'Deleted' || !tasks.some(task => !task.completed) ? ' disabled' : ''}>Complete visible tasks</button>
      <button type="submit" name="completed" value="0"${scope === 'Archived' || filter === 'Deleted' || !tasks.some(task => task.completed) ? ' disabled' : ''}>Reopen visible tasks</button>
    </form>
    <p data-testid="directory-summary">${tasks.filter(task => task.completed).length}/${tasks.length} completed</p>
    <section class="tasks" aria-label="Directory tasks">${tasks.length ? tasks.map(task => `
      <div class="task" data-testid="directory-task-row">
        <div data-testid="directory-task-title" style="white-space: pre-wrap">${escapeHtml(task.title)}</div>
        <div data-testid="directory-project-name" style="white-space: pre-wrap">${escapeHtml(task.project_name)}</div>
        <div data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</div>
        <div data-testid="directory-task-priority">${escapeHtml(task.priority)}</div>
        <div data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</div>
        <div data-testid="directory-task-notes" style="white-space: pre-wrap; overflow-wrap: anywhere">${escapeHtml(task.notes).replace(/\r\n?/g, '\n').replace(/\n/g, '&#10;')}</div>
        <form method="get" action="/projects/${task.project_id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p data-directory-empty role="status">No matching tasks</p>'}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const query = range.search || '';
  const rangeFields = `<input type="hidden" name="search" value="${escapeHtml(query)}"><input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}"><input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const eligible = destinations.all(project.id);
  const moveDisabled = project.archived || !eligible.length;
  const tasks = listTasks.all(project.id).filter(task => matchesTask(task, filter, priority, range));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form method="get" action="/projects/${project.id}/export"><button type="submit">Download project</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/search">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="query" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search tasks</button>
    </form>
    <section class="tasks" aria-label="Tasks">${tasks.length ? tasks.map(task => `
      <div class="task" data-testid="task-row" data-task-id="${task.id}">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived || task.deleted ? ' disabled' : ''} data-save-completion><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived || task.deleted ? ' disabled' : ''}>
          <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived || task.deleted ? ' disabled' : ''}>
          <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived || task.deleted ? ' disabled' : ''}>${escapeHtml(task.notes).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')}</textarea>
          <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
            ${eligible.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore' : 'Delete'} task</button>
        </form>
      </div>`).join('') : '<p>No matching tasks.</p>'}</section>`).replace(/(<form\b[^>]*action="\/projects\/[^\"]*"[^>]*>[\s\S]*?)(<\/form>)/g,
    (_, form, closing) => `${form}${rangeFields}${closing}`);
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function sendHtml(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams.get('search'))));
    } else if (req.method === 'GET' && url.pathname === '/directory') {
      sendHtml(res, 200, directoryPage(projectFilter(url.searchParams.get('scope')),
        taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')),
        dueRange(url.searchParams), '', directoryOrder(url.searchParams.get('order'))));
    } else if (req.method === 'POST' && url.pathname === '/directory/completion') {
      const form = await readForm(req);
      const scope = projectFilter(form.get('scope'));
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const completed = form.get('completed');
      if (scope === 'Active' && filter !== 'Deleted' && ['0', '1'].includes(completed)) {
        // Select and update the entire current intersection in one transaction;
        // no client-supplied task IDs can broaden the result set.
        transaction(() => {
          for (const task of directoryTasks.all(0)) {
            if (matchesTask(task, filter, priority, range)) {
              updateTask.run(Number(completed), task.id, task.project_id);
            }
          }
        });
      }
      res.writeHead(303, { Location: directoryLocation(scope, filter, priority, range, directoryOrder(form.get('order'))) });
      res.end();
    } else if (req.method === 'POST' && url.pathname === '/directory/due-range') {
      const form = await readForm(req);
      const scope = projectFilter(form.get('scope'));
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = dueRange(form);
      const from = (form.get('from') || '').trim();
      const through = (form.get('through') || '').trim();
      const error = (from && !validDueDate(from)) || (through && !validDueDate(through))
        ? 'Due range must use valid YYYY-MM-DD dates'
        : from && through && from > through ? 'Due from must not be after Due through' : '';
      if (error) {
        sendHtml(res, 200, directoryPage(scope, filter, priority, previous, error, directoryOrder(form.get('order'))));
        return;
      }
      res.writeHead(303, { Location: directoryLocation(scope, filter, priority, { from, through, search: previous.search }, directoryOrder(form.get('order'))) });
      res.end();
    } else if (req.method === 'POST' && url.pathname === '/projects/import') {
      const form = await readForm(req);
      const submitted = { json: form.get('projectJson') || '', name: form.get('importedName') || '' };
      const name = submitted.name.trim();
      const imported = validateImport(submitted.json);
      const error = !name ? 'Project name is required' : !imported ? 'Invalid project JSON' : '';
      if (error) {
        sendHtml(res, 200, projectsPage(error, projectFilter(form.get('filter')), searchQuery(form.get('search')), submitted));
        return;
      }
      let id;
      transaction(() => {
        id = importProject.run(name, Number(imported.archived), imported.defaultPriority).lastInsertRowid;
        imported.tasks.forEach((task, index) => {
          const taskId = importTask.run(id, task.title, Number(task.completed), task.priority,
            task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), index + 1).lastInsertRowid;
          rememberPosition.run(taskId, id, id);
        });
      });
      res.writeHead(303, { Location: `/projects/${id}` });
      res.end();
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectsPage('Project name is required', projectFilter(form.get('filter')), searchQuery(form.get('search'))));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: `/?${new URLSearchParams({ filter: projectFilter(form.get('filter')), search: searchQuery(form.get('search')) })}` });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = dueRange(form);
      const from = (form.get('from') || '').trim();
      const through = (form.get('through') || '').trim();
      const error = (from && !validDueDate(from)) || (through && !validDueDate(through))
        ? 'Due range must use valid YYYY-MM-DD dates'
        : from && through && from > through ? 'Due from must not be after Due through' : '';
      if (error) {
        sendHtml(res, 200, projectPage(project, filter, error, priority, previous));
        return;
      }
      res.writeHead(303, { Location: projectLocation(id, filter, priority, { from, through, search: previous.search }) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/search$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      if (!Number.isSafeInteger(id) || !getProject.get(id)) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const state = { ...dueRange(form), search: searchQuery(form.get('query')) };
      res.writeHead(303, { Location: projectLocation(id, taskFilter(form.get('filter')), priorityFilter(form.get('priorityFilter')), state) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      const priority = form.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
        return;
      }
      updateDefaultPriority.run(priority, id);
      res.writeHead(303, { Location: projectLocation(id, filter, selectedPriority, dueRange(form)) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, dueRange(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectPage(project, filter, 'Project name is required', priority, dueRange(form)));
        return;
      }
      renameProject.run(name, id);
      res.writeHead(303, { Location: projectLocation(id, filter, priority, dueRange(form)) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      if (!Number.isSafeInteger(id) || !getProject.get(id)) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const archived = url.pathname.endsWith('/archive');
      archiveProject.run(archived ? 1 : 0, id);
      res.writeHead(303, { Location: `/?${new URLSearchParams({ filter: archived ? 'Active' : 'Archived', search: searchQuery(form.get('search')) })}` });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+\/export$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_priority,
          tasks: listTasks.all(id).map(task => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Browser textarea line endings are portable LF in the export only.
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
      res.end(JSON.stringify(document));
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(?:rename|priority|due-date|move|notes|delete|restore))?)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      if (parts[4]) {
        const taskId = Number(parts[4]);
        const task = Number.isSafeInteger(taskId) ? getTask.get(taskId, projectId) : undefined;
        if (!task) {
          sendHtml(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        if (task.deleted && parts[5] !== 'restore') {
          sendHtml(res, 403, projectPage(project, filter, 'Deleted task cannot be changed', selectedPriority, dueRange(form)));
          return;
        }
        if (parts[5] === 'delete' || parts[5] === 'restore') {
          setDeleted.run(parts[5] === 'delete' ? 1 : 0, taskId, projectId);
        } else if (parts[5] === 'move') {
          const destinationId = Number(form.get('destination'));
          const destination = Number.isSafeInteger(destinationId) ? getProject.get(destinationId) : undefined;
          if (!destination || destination.archived || destinationId === projectId) {
            sendHtml(res, 400, projectPage(project, filter, 'Choose an active destination project', selectedPriority, dueRange(form)));
            return;
          }
          transaction(() => {
            rememberPosition.run(taskId, destinationId, destinationId);
            moveTask.run(destinationId, taskId, destinationId, taskId, projectId);
          });
        } else if (parts[5] === 'notes') {
          updateNotes.run(form.get('notes') || '', taskId, projectId);
        } else if (parts[5] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
            return;
          }
          renameTask.run(title, taskId, projectId);
        } else if (parts[5] === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            sendHtml(res, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, dueRange(form)));
            return;
          }
          updateDueDate.run(dueDate, taskId, projectId);
        } else if (parts[5] === 'priority') {
          const priority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(priority)) {
            sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
            return;
          }
          updatePriority.run(priority, taskId, projectId);
        } else {
          const completed = form.get('completed') === '1';
          updateTask.run(completed ? 1 : 0, taskId, projectId);
          if (req.headers.accept === 'application/json') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ completed }));
            return;
          }
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
          return;
        }
        transaction(() => {
          const result = createTask.run(projectId, title, project.default_priority, projectId);
          rememberPosition.run(result.lastInsertRowid, projectId, projectId);
        });
      }
      res.writeHead(303, { Location: projectLocation(projectId, filter, selectedPriority, dueRange(form)) });
      res.end();
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Unable to complete request'}</h1>`));
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
