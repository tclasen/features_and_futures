import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH ?? 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )
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
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE tasks SET position = id');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS task_positions_project_order ON task_positions(project_id, position);
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const taskPriorities = ['Low', 'Normal', 'High'];
const taskFilters = ['All', 'Open', 'Completed', 'Deleted'];
const listProjects = db.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const addImportedProject = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)');
const addImportedTask = db.prepare(`
  INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const listDestinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const listDirectoryTasks = db.prepare(`
  SELECT tasks.*, projects.name AS project_name
  FROM tasks JOIN projects ON projects.id = tasks.project_id
  WHERE projects.archived = ? ORDER BY projects.id, tasks.position, tasks.id
`);
const addTask = db.prepare(`
  INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))
`);
const rememberCreatedTask = db.prepare(`
  INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?
`);
const rememberDestination = db.prepare(`
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?)
  FROM tasks WHERE id = ? AND project_id = ?
`);
const moveTask = db.prepare(`
  UPDATE tasks SET project_id = ?,
    position = (SELECT position FROM task_positions WHERE project_id = ? AND task_id = ?)
  WHERE id = ? AND project_id = ?
`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT deleted FROM tasks WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

function transaction(action) {
  db.exec('BEGIN');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validDueDate(value) {
  if (value === '') return true;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function parseProjectImport(json) {
  let document;
  try {
    document = JSON.parse(json);
  } catch {
    return null;
  }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nonblank = value => typeof value === 'string' && value.trim() !== '';
  if (!object(document) || document.format !== 'workboard-project' || document.version !== 1) return null;
  const project = document.project;
  if (!object(project) || !nonblank(project.name) || typeof project.archived !== 'boolean' ||
      !taskPriorities.includes(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  for (const task of project.tasks) {
    if (!object(task) || !nonblank(task.title) || typeof task.completed !== 'boolean' ||
        !taskPriorities.includes(task.priority) || typeof task.dueDate !== 'string' ||
        !validDueDate(task.dueDate) || typeof task.notes !== 'string' ||
        typeof task.deleted !== 'boolean') return null;
  }
  return project;
}

function importProject(project, name) {
  return transaction(() => {
    const projectId = addImportedProject.run(name, Number(project.archived), project.defaultPriority).lastInsertRowid;
    project.tasks.forEach((task, index) => {
      const taskId = addImportedTask.run(projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes.replace(/\r\n?/g, '\n'), Number(task.deleted), index + 1).lastInsertRowid;
      rememberCreatedTask.run(taskId);
    });
    return projectId;
  });
}

function taskFilter(value) {
  return taskFilters.includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function dueRange(values, fromKey = 'dueFrom', throughKey = 'dueThrough') {
  const from = (values.get(fromKey) ?? '').trim();
  const through = (values.get(throughKey) ?? '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through } : { from: '', through: '' };
}

function searchQuery(values, key) {
  return (values.get(key) ?? '').trim();
}

function matchesSearch(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function matchesTask(task, filter, priority, range, query) {
  return matchesSearch(task.title, query) &&
    (filter === 'Deleted' ? Boolean(task.deleted) :
      !task.deleted && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date !== '' &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through)));
}

function dueRangeError(range) {
  if (!validDueDate(range.from) || !validDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  return range.from && range.through && range.from > range.through
    ? 'Due from must not be after Due through' : '';
}

function searchField(key, query) {
  return `<input type="hidden" name="${key}" value="${escapeHtml(query)}">`;
}

function rangeFields(range, query = '') {
  return `${searchField('taskSearch', query)}<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
}

function projectPath(projectId, filter, priority, range = { from: '', through: '' }, query = '') {
  const params = new URLSearchParams();
  if (filter !== 'All') params.set('filter', filter);
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  if (query) params.set('taskSearch', query);
  return `/projects/${projectId}${params.size ? `?${params}` : ''}`;
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
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active', query = '', importInput = { json: '', name: '' }) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, query));
  return page('Projects', `
    <header><p class="eyebrow">PROJECT WORKSPACE</p><h1>Workboard</h1></header>
    <form method="get" action="/directory"><button class="secondary">Task directory</button></form>
    <section aria-labelledby="create-heading">
      <h2 id="create-heading">Create a project</h2>
      <form method="post" action="/projects" class="create-form">
        <div class="field"><label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autocomplete="off"></div>
        <button type="submit">Create project</button>
      </form>
      ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    </section>
    <section aria-labelledby="import-heading">
      <h2 id="import-heading">Import a project</h2>
      <form method="post" action="/projects/import">
        <label for="project-json">Project JSON</label>
        <textarea id="project-json" name="json" rows="6">\n${escapeHtml(importInput.json)}</textarea>
        <label for="imported-project-name">Imported project name</label>
        <input id="imported-project-name" name="name" type="text" value="${escapeHtml(importInput.name)}" autocomplete="off">
        <button type="submit">Import project</button>
      </form>
    </section>
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      <form method="get" action="/">
        ${searchField('projectSearch', query)}
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form method="get" action="/" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <div class="field"><label for="project-search">Project search</label>
        <input id="project-search" name="projectSearch" type="text" value="${escapeHtml(query)}" autocomplete="off"></div>
        <button type="submit">Search projects</button>
      </form>
      ${projects.length ? `<div class="project-list">${projects.map(project => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit" class="secondary">Open project</button>
          </form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
            <button type="submit" class="secondary">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>`).join('')}</div>` : `<p class="muted">No ${filter.toLowerCase()} projects to show.</p>`}
    </section>`);
}

function projectPage(project, filter, priority = 'All', error = '', range = { from: '', through: '' }, rangeInput = range, query = '') {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter(task => matchesTask(task, filter, priority, range, query));
  return page(project.name, `
    <form method="get" action="/"><button class="secondary">Projects</button></form>
    <header><p class="eyebrow">PROJECT</p><h1>${escapeHtml(project.name)}</h1>
      ${project.archived ? '<p>Archived project</p>' : ''}
    </header>
    <form method="get" action="/projects/${project.id}/export">
      <button type="submit" class="secondary">Download project</button>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-labelledby="rename-project-heading">
      <h2 id="rename-project-heading">Rename project</h2>
      <form method="post" action="/projects/${project.id}/rename" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range, query)}
        <div class="field"><label for="new-project-name">New project name</label>
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </form>
    </section>
    <section aria-labelledby="create-task-heading">
      <h2 id="create-task-heading">Create a task</h2>
      <form method="post" action="/projects/${project.id}/default-priority">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range, query)}
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}
          onchange="this.form.requestSubmit()">
          ${taskPriorities.map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form method="post" action="/projects/${project.id}/tasks" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range, query)}
        <div class="field"><label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text" autocomplete="off"></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </form>
    </section>
    <section aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <form method="get" action="/projects/${project.id}">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${taskFilters.map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
          ${['All', ...taskPriorities].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        ${rangeFields(range, query)}
      </form>
      <form method="get" action="/projects/${project.id}" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
        <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
        <div class="field"><label for="task-search">Task search</label>
        <input id="task-search" name="taskSearch" type="text" value="${escapeHtml(query)}" autocomplete="off"></div>
        <button type="submit">Search tasks</button>
      </form>
      <form method="post" action="/projects/${project.id}/due-range" class="due-range-form">
        ${searchField('taskSearch', query)}
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <input type="hidden" name="appliedDueFrom" value="${escapeHtml(range.from)}">
        <input type="hidden" name="appliedDueThrough" value="${escapeHtml(range.through)}">
        <div class="field"><label for="due-from">Due from</label>
        <input id="due-from" name="dueFrom" type="text" value="${escapeHtml(rangeInput.from)}" autocomplete="off"></div>
        <div class="field"><label for="due-through">Due through</label>
        <input id="due-through" name="dueThrough" type="text" value="${escapeHtml(rangeInput.through)}" autocomplete="off"></div>
        <button type="submit">Apply due range</button>
      </form>
      ${tasks.length ? tasks.map(task => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <input type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${(project.archived || task.deleted) ? ' disabled' : ''}
              onchange="this.form.requestSubmit()">
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${(project.archived || task.deleted) ? ' disabled' : ''}
              onchange="this.form.requestSubmit()">
              ${taskPriorities.map(priority => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename" class="task-rename-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <label for="new-task-title-${task.id}">New task title</label>
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${(project.archived || task.deleted) ? ' disabled' : ''}>
            <button type="submit"${(project.archived || task.deleted) ? ' disabled' : ''}>Rename task</button>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date" class="task-due-date-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <label for="task-due-date-${task.id}">Task due date</label>
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${(project.archived || task.deleted) ? ' disabled' : ''}>
            <button type="submit"${(project.archived || task.deleted) ? ' disabled' : ''}>Save due date</button>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/notes" class="task-notes-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <label for="task-notes-${task.id}">Task notes</label>
            <textarea id="task-notes-${task.id}" name="notes" rows="4"${(project.archived || task.deleted) ? ' disabled' : ''}>
${escapeHtml(task.notes)}</textarea>
            <button type="submit"${(project.archived || task.deleted) ? ' disabled' : ''}>Save notes</button>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <label for="destination-project-${task.id}">Destination project</label>
            <select id="destination-project-${task.id}" name="destinationProject"${(moveDisabled || task.deleted) ? ' disabled' : ''}>
              ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
            </select>
            <button type="submit"${(moveDisabled || task.deleted) ? ' disabled' : ''}>Move task</button>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range, query)}
            <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
          </form>
        </div>`).join('') : '<p class="muted">No tasks to show.</p>'}
    </section>`);
}

function directoryState(values) {
  return {
    scope: values.get('scope') === 'Archived' ? 'Archived' : 'Active',
    filter: taskFilter(values.get('filter')),
    priority: priorityFilter(values.get('priorityFilter')),
    range: dueRange(values),
    query: searchQuery(values, 'directorySearch'),
  };
}

function directoryPath(state) {
  const params = new URLSearchParams({ scope: state.scope, filter: state.filter,
    priorityFilter: state.priority, dueFrom: state.range.from,
    dueThrough: state.range.through, directorySearch: state.query });
  return `/directory?${params}`;
}

function directoryPage(state, error = '', rangeInput = state.range) {
  const { scope, filter, priority, range, query } = state;
  const tasks = listDirectoryTasks.all(scope === 'Archived' ? 1 : 0)
    .filter(task => matchesTask(task, filter, priority, range, query));
  const selections = `<input type="hidden" name="scope" value="${scope}">
    <input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">`;
  const rangeInputs = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  return page('Task directory', `
    <form method="get" action="/"><button class="secondary">Projects</button></form>
    <header><h1>Task directory</h1></header>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-label="Directory filters">
      <form method="get" action="/directory">
        <label for="project-scope">Project scope</label>
        <select id="project-scope" name="scope" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map(option => `<option${option === scope ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${taskFilters.map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
          ${['All', ...taskPriorities].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        ${rangeInputs}${searchField('directorySearch', query)}
      </form>
      <form method="get" action="/directory" class="create-form">
        ${selections}${rangeInputs}
        <div class="field"><label for="directory-search">Directory search</label>
        <input id="directory-search" name="directorySearch" type="text" value="${escapeHtml(query)}" autocomplete="off"></div>
        <button type="submit">Search directory</button>
      </form>
      <form method="post" action="/directory/due-range" class="due-range-form">
        ${selections}${searchField('directorySearch', query)}
        <input type="hidden" name="appliedDueFrom" value="${escapeHtml(range.from)}">
        <input type="hidden" name="appliedDueThrough" value="${escapeHtml(range.through)}">
        <div class="field"><label for="due-from">Due from</label>
        <input id="due-from" name="dueFrom" type="text" value="${escapeHtml(rangeInput.from)}" autocomplete="off"></div>
        <div class="field"><label for="due-through">Due through</label>
        <input id="due-through" name="dueThrough" type="text" value="${escapeHtml(rangeInput.through)}" autocomplete="off"></div>
        <button type="submit">Apply due range</button>
      </form>
    </section>
    <section aria-label="Directory results">
      ${tasks.length ? tasks.map(task => `
        <div data-testid="directory-task-row" class="directory-row">
          <h2 data-testid="directory-task-title">${escapeHtml(task.title)}</h2>
          <p data-testid="directory-project-name">${escapeHtml(task.project_name)}</p>
          <p data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</p>
          <p data-testid="directory-task-priority">${escapeHtml(task.priority)}</p>
          <p data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</p>
          <div data-testid="directory-task-notes" class="directory-notes">${escapeHtml(task.notes)}</div>
          <form method="get" action="/projects/${task.project_id}">
            <button type="submit" class="secondary">Open project</button>
          </form>
        </div>`).join('') : '<p class="muted">No tasks to show.</p>'}
    </section>`);
}

async function readForm(request) {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/styles.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(styles);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active', searchQuery(url.searchParams, 'projectSearch')));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/directory') {
      sendHtml(response, 200, directoryPage(directoryState(url.searchParams)));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/directory/due-range') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const state = directoryState(form);
      const range = { from: (form.get('dueFrom') ?? '').trim(), through: (form.get('dueThrough') ?? '').trim() };
      const error = dueRangeError(range);
      if (error) {
        state.range = dueRange(form, 'appliedDueFrom', 'appliedDueThrough');
        sendHtml(response, 400, directoryPage(state, error, range));
      } else {
        state.range = range;
        redirect(response, directoryPath(state));
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      addProject.run(name);
      redirect(response, '/');
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects/import') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const input = { json: form.get('json') ?? '', name: form.get('name') ?? '' };
      const name = input.name.trim();
      const project = parseProjectImport(input.json);
      if (!name || !project) {
        sendHtml(response, 400, projectsPage(!name ? 'Project name is required' : 'Invalid project JSON', 'Active', '', input));
        return;
      }
      redirect(response, `/projects/${importProject(project, name)}`);
      return;
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveRoute) {
      const result = setArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, archiveRoute[1]);
      if (result.changes) {
        redirect(response, archiveRoute[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const exportRoute = /^\/projects\/([1-9]\d*)\/export$/.exec(url.pathname);
    if (request.method === 'GET' && exportRoute) {
      const project = findProject.get(exportRoute[1]);
      if (project) {
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
        return;
      }
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')), '', dueRange(url.searchParams), undefined, searchQuery(url.searchParams, 'taskSearch')));
        return;
      }
    }
    const dueRangeRoute = /^\/projects\/([1-9]\d*)\/due-range$/.exec(url.pathname);
    if (request.method === 'POST' && dueRangeRoute) {
      const project = findProject.get(dueRangeRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const query = searchQuery(form, 'taskSearch');
        const previousRange = dueRange(form, 'appliedDueFrom', 'appliedDueThrough');
        const range = {
          from: (form.get('dueFrom') ?? '').trim(),
          through: (form.get('dueThrough') ?? '').trim(),
        };
        const error = dueRangeError(range);
        if (error) {
          sendHtml(response, 400, projectPage(project, filter, priority, error, previousRange, range, query));
          return;
        }
        redirect(response, projectPath(project.id, filter, priority, range, query));
        return;
      }
    }
    const defaultPriorityRoute = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultPriorityRoute) {
      const project = findProject.get(defaultPriorityRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const query = searchQuery(form, 'taskSearch');
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project cannot be changed', range, undefined, query));
          return;
        }
        const defaultPriority = form.get('priority');
        if (!taskPriorities.includes(defaultPriority)) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Invalid task priority', range, undefined, query));
          return;
        }
        setDefaultPriority.run(defaultPriority, project.id);
        redirect(response, projectPath(project.id, filter, priority, range, query));
        return;
      }
    }
    const renameRoute = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameRoute) {
      const project = findProject.get(renameRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const query = searchQuery(form, 'taskSearch');
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project cannot be changed', range, undefined, query));
          return;
        }
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Project name is required', range, undefined, query));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectPath(project.id, filter, priority, range, query));
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(?:\/(rename|priority|due-date|notes|move|delete|restore))?)?$/.exec(url.pathname);
    if (request.method === 'POST' && taskRoute) {
      const project = findProject.get(taskRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const query = searchQuery(form, 'taskSearch');
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project cannot be changed', range, undefined, query));
          return;
        }
        const taskId = taskRoute[2];
        if (taskId) {
          const task = findTask.get(taskId, project.id);
          if (!task) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const action = taskRoute[3];
          if (task.deleted && action !== 'restore') {
            sendHtml(response, 403, projectPage(project, filter, priority, 'Deleted task cannot be changed until restored', range, undefined, query));
            return;
          }
          let result;
          if (action === 'delete' || action === 'restore') {
            result = setTaskDeleted.run(action === 'delete' ? 1 : 0, taskId, project.id);
          } else if (action === 'move') {
            const destinationId = form.get('destinationProject') ?? '';
            const destination = /^[1-9]\d*$/.test(destinationId) ? findProject.get(destinationId) : undefined;
            if (!destination || destination.id === project.id || destination.archived) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Choose an active destination project', range, undefined, query));
              return;
            }
            result = transaction(() => {
              rememberDestination.run(destination.id, destination.id, taskId, project.id);
              return moveTask.run(destination.id, destination.id, taskId, taskId, project.id);
            });
          } else if (taskRoute[3] === 'rename') {
            const title = (form.get('title') ?? '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required', range, undefined, query));
              return;
            }
            result = renameTask.run(title, taskId, project.id);
          } else if (taskRoute[3] === 'priority') {
            const newPriority = form.get('priority');
            if (!taskPriorities.includes(newPriority)) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Invalid task priority', range, undefined, query));
              return;
            }
            result = setTaskPriority.run(newPriority, taskId, project.id);
          } else if (taskRoute[3] === 'notes') {
            result = setTaskNotes.run(form.get('notes') ?? '', taskId, project.id);
          } else if (taskRoute[3] === 'due-date') {
            const dueDate = (form.get('dueDate') ?? '').trim();
            if (!validDueDate(dueDate)) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Due date must be a valid YYYY-MM-DD date', range, undefined, query));
              return;
            }
            result = setTaskDueDate.run(dueDate, taskId, project.id);
          } else {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required', range, undefined, query));
            return;
          }
          transaction(() => {
            const result = addTask.run(project.id, title, project.default_priority, project.id);
            rememberCreatedTask.run(result.lastInsertRowid);
          });
        }
        redirect(response, projectPath(project.id, filter, priority, range, query));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1><a href="/">Projects</a>'));
  }
});

const styles = `
  :root { font-family: system-ui, sans-serif; color: #172c35; background: #f4f7f8; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  main { max-width: 860px; margin: 64px auto; padding: 0 24px; }
  header { margin: 32px 0; }
  .eyebrow { color: #526970; font-size: .75rem; font-weight: 700; letter-spacing: .15em; }
  h1 { font-size: 2.5rem; margin: 8px 0; overflow-wrap: anywhere; }
  h2 { font-size: 1.1rem; margin: 0 0 20px; }
  section { padding: 28px; background: white; border: 1px solid #dce5e8; border-radius: 12px; margin-bottom: 24px; }
  .due-range-form { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; margin-bottom: 24px; }
  .create-form { display: flex; align-items: end; gap: 16px; }
  .field { flex: 1; }
  label { display: block; font-weight: 600; font-size: .9rem; margin-bottom: 8px; }
  input[type="text"], select, textarea { width: 100%; border: 1px solid #8a9ca3; border-radius: 6px; padding: 12px; font: inherit; }
  .task-row .task-notes-form { flex: 1 1 100%; min-width: 0; }
  textarea { display: block; resize: vertical; margin-bottom: 12px; }
  select { margin-bottom: 16px; }
  input[type="checkbox"] { width: 22px; height: 22px; cursor: pointer; accent-color: #176659; }
  button { border: 1px solid #176659; border-radius: 6px; padding: 12px 18px; background: #176659; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #104e44; }
  button.secondary { background: white; color: #176659; }
  button.secondary:hover { background: #edf6f3; }
  :focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
  .project-row, .task-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 16px 0; border-top: 1px solid #dce5e8; }
  .project-row span, .task-row span { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
  .project-row { flex-wrap: wrap; }
  .task-row { flex-wrap: wrap; }
  .task-row .task-rename-form, .task-row .task-due-date-form { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .task-rename-form label, .task-due-date-form label { margin: 0; }
  .task-rename-form input[type="text"], .task-due-date-form input[type="text"] { flex: 1 1 180px; width: auto; min-width: 0; }
  .project-row form, .task-row form { flex-shrink: 0; }
  button:disabled, input:disabled, select:disabled, textarea:disabled { cursor: not-allowed; opacity: .6; }
  .alert { color: #a12626; }
  .muted { color: #526970; }
  .directory-row { padding: 20px 0; border-top: 1px solid #dce5e8; overflow-wrap: anywhere; }
  .directory-row h2 { white-space: pre-wrap; margin-bottom: 8px; }
  .directory-row [data-testid="directory-project-name"] { white-space: pre-wrap; }
  .directory-notes { white-space: pre-wrap; margin-bottom: 16px; }
  @media (max-width: 560px) { main { margin-top: 32px; padding: 0 16px; } section { padding: 20px; } .create-form { align-items: stretch; flex-direction: column; } }
`;

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
