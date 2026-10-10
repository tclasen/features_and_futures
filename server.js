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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Retain positions even while tasks are away, so arrivals never reuse their slots.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
const rememberPosition = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?`);
const updateTaskProject = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?`);
function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function moveTask(destinationId, taskId, sourceId) {
  transaction(() => {
    rememberPosition.run(taskId, destinationId, destinationId);
    updateTaskProject.run(destinationId, taskId, destinationId, taskId, sourceId);
  });
}
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?`);
const recordInitialPosition = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
function addTask(projectId, title, priority) {
  transaction(() => {
    const result = insertTask.run(projectId, title, priority, projectId);
    recordInitialPosition.run(result.lastInsertRowid);
  });
}
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17233b; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; }
    h1 { font-size: 2rem; overflow-wrap: anywhere; }
    .panel, .project-row, .task-row { background: white; border: 1px solid #d9e0eb; border-radius: 10px; padding: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"], select { flex: 1; min-width: 180px; border: 1px solid #8794ab; border-radius: 6px; padding: 11px; font: inherit; }
    button { background: #2456b5; color: white; border: 0; border-radius: 6px; padding: 12px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194391; }
    button:disabled { background: #768194; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #e29116; outline-offset: 3px; }
    [role="alert"] { color: #a51a26; margin-top: 0; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex-shrink: 0; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-create, .task-filter { margin-top: 24px; }
    @media (max-width: 500px) { main { margin: 20px auto; padding: 16px; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const asciiLower = value => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
const matchesSearch = (name, query) => asciiLower(name).includes(asciiLower(query));
const searchQuery = params => (params.get('search') || '').trim();

function home(error = '', filter = 'Active', search = '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter(project => matchesSearch(project.name, search)).map(project => `
    <div class="project-row" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">${searchField}<button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
    </div>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form class="panel" action="/projects" method="post">
      ${searchField}<input type="hidden" name="filter" value="${filter}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <form class="task-filter" action="/" method="get">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <div class="controls"><input id="project-search" name="search" type="text" value="${escapeHtml(search)}"><button type="submit">Search projects</button></div>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, search = range.search || '') {
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}"><input type="hidden" name="dueThrough" value="${range.through}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}"><input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}${searchField}`;
  const destinations = listProjects.all(0).filter(destination => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const rows = listTasks.all(project.id)
    .filter(task => matchesSearch(task.title, search) && (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority)
      && ((!range.from && !range.through) || (task.due_date
        && (!range.from || task.due_date >= range.from)
        && (!range.through || task.due_date <= range.through))))
    .map(task => `<div class="task-row" data-testid="task-row">
      <form action="/projects/${project.id}/tasks/${task.id}" method="post">
        ${filterFields}
        <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
        ${filterFields}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${['Low', 'Normal', 'High'].map(option => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
        ${filterFields}
        <label for="task-due-date-${task.id}">Task due date</label>
        <div class="controls"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
        ${filterFields}
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="controls"><input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/move" method="post">
        ${filterFields}
        <label for="destination-project-${task.id}">Destination project</label>
        <div class="controls"><select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}</select><button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button></div>
      </form>
    </div>`).join('');
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="panel task-create" action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="controls"><input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form class="panel task-create" action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="panel task-create" action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="controls"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      ${rangeFields}${searchField}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="panel task-filter" action="/projects/${project.id}/due-range" method="post">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${range.from}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${range.through}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form class="panel task-filter" action="/projects/${project.id}" method="get">
      <input type="hidden" name="filter" value="${filter}"><input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}
      <label for="task-search">Task search</label>
      <div class="controls"><input id="task-search" name="search" type="text" value="${escapeHtml(search)}"><button type="submit">Search tasks</button></div>
    </form>
    <section class="projects" aria-label="Tasks">${rows}</section>`);
}

const taskFilter = value => ['Open', 'Completed'].includes(value) ? value : 'All';
const priorityFilter = value => ['Low', 'Normal', 'High'].includes(value) ? value : 'All';
const projectLocation = (id, filter, priority, range, search = range?.search || '') => `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range?.from ? `&dueFrom=${range.from}` : ''}${range?.through ? `&dueThrough=${range.through}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;

function appliedRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through, search: searchQuery(params) } : { from: '', through: '', search: searchQuery(params) };
}

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, home('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active', searchQuery(url.searchParams)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const form = new URLSearchParams(body);
      const name = (form.get('name') || '').trim();
      const filter = form.get('filter') === 'Archived' ? 'Archived' : 'Active';
      const location = `/?filter=${filter}&search=${encodeURIComponent(searchQuery(form))}`;
      if (!name) {
        html(res, 200, home('Project name is required', filter, searchQuery(form)));
        return;
      }
      addProject.run(name);
      res.writeHead(303, { Location: location });
      res.end();
      return;
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (req.method === 'POST' && archiveMatch) {
      const form = await readForm(req);
      if (!form) {
        html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(res, `/?filter=${archiveMatch[2] === 'archive' ? 'Active' : 'Archived'}&search=${encodeURIComponent(searchQuery(form))}`);
        return;
      }
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) {
        html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedRange(url.searchParams), searchQuery(url.searchParams)));
        return;
      }
    }
    const rangeMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/due-range$/);
    if (req.method === 'POST' && rangeMatch) {
      const project = getProject.get(rangeMatch[1]);
      if (project) {
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const from = (form.get('from') || '').trim();
        const through = (form.get('through') || '').trim();
        const error = !validDueDate(from) || !validDueDate(through)
          ? 'Due range must use valid YYYY-MM-DD dates'
          : from && through && from > through ? 'Due from must not be after Due through' : '';
        if (error) {
          html(res, 200, projectPage(project, filter, error, priority, appliedRange(form)));
        } else {
          redirect(res, projectLocation(project.id, filter, priority, { from, through }, searchQuery(form)));
        }
        return;
      }
    }
    const defaultMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/default-priority$/);
    if (req.method === 'POST' && defaultMatch) {
      const project = getProject.get(defaultMatch[1]);
      if (project) {
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(res, 403, projectPage(project, filter, 'Archived project is read-only', priority, appliedRange(form)));
          return;
        }
        const value = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(value)) {
          html(res, 400, projectPage(project, filter, 'Invalid task priority', priority, appliedRange(form)));
          return;
        }
        setDefaultPriority.run(value, project.id);
        redirect(res, projectLocation(project.id, filter, priority, appliedRange(form)));
        return;
      }
    }
    const renameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (req.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, 'All', 'Archived project is read-only'));
          return;
        }
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const name = (form.get('name') || '').trim();
        if (!name) {
          html(res, 200, projectPage(project, filter, 'Project name is required', priority, appliedRange(form)));
          return;
        }
        renameProject.run(name, project.id);
        redirect(res, projectLocation(project.id, filter, priority, appliedRange(form)));
        return;
      }
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(\/(?:rename|priority|due-date|move))?)?$/);
    if (req.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, 'All', 'Archived project is read-only'));
          return;
        }
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (taskMatch[3] === '/move') {
          if (!getTask.get(taskMatch[2], project.id)) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const destinationId = form.get('destination') || '';
          const destination = /^[1-9]\d*$/.test(destinationId) ? getProject.get(destinationId) : null;
          if (!destination || destination.archived || destination.id === project.id) {
            html(res, 400, projectPage(project, filter, 'Choose an active destination project', selectedPriority, appliedRange(form)));
            return;
          }
          moveTask(destination.id, taskMatch[2], project.id);
        } else if (taskMatch[3] === '/due-date') {
          if (!getTask.get(taskMatch[2], project.id)) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const dueDate = (form.get('dueDate') || '').trim();
          if (!validDueDate(dueDate)) {
            html(res, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, appliedRange(form)));
            return;
          }
          setDueDate.run(dueDate, taskMatch[2], project.id);
        } else if (taskMatch[3] === '/priority') {
          const priority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(priority)) {
            html(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, appliedRange(form)));
            return;
          }
          if (!setPriority.run(priority, taskMatch[2], project.id).changes) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else if (taskMatch[3] === '/rename') {
          if (!getTask.get(taskMatch[2], project.id)) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, appliedRange(form)));
            return;
          }
          renameTask.run(title, taskMatch[2], project.id);
        } else if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, appliedRange(form)));
            return;
          }
          addTask(project.id, title, project.default_priority);
        }
        redirect(res, projectLocation(project.id, filter, selectedPriority, appliedRange(form)));
        return;
      }
    }
    html(res, 404, page('Not found', '<h1>Not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
