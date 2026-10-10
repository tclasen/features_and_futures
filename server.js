import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET position = id');
}
// Remember positions even while a task belongs to another project. Seed from
// current positions so upgrading an existing database preserves its order.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const projectFilter = value => value === 'Archived' ? 'Archived' : 'Active';
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const previousPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const relocateTask = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
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
    const { lastInsertRowid } = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(lastInsertRowid, projectId, position);
  });
}
function moveTask(taskId, sourceId, destinationId) {
  transaction(() => {
    let remembered = previousPosition.get(taskId, destinationId);
    if (!remembered) {
      remembered = nextPosition.get(destinationId);
      rememberPosition.run(taskId, destinationId, remembered.position);
    }
    relocateTask.run(destinationId, remembered.position, taskId, sourceId);
  });
}
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
const priorities = ['Low', 'Normal', 'High'];
const taskFilter = value => ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
const priorityFilter = value => ['All', ...priorities].includes(value) ? value : 'All';
function dueRangeError(from, through) {
  if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) return 'Due from must not be after Due through';
  return '';
}
function appliedRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return dueRangeError(from, through) ? { from: '', through: '' } : { from, through };
}
const searchQuery = params => (params.get('search') || '').trim();
const asciiLower = value => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
const matchesSearch = (value, query) => asciiLower(value).includes(asciiLower(query));
const searchSuffix = query => query ? `&search=${encodeURIComponent(query)}` : '';
const listLocation = (filter, query) => filter === 'Active' && !query ? '/' : `/?filter=${filter}${searchSuffix(query)}`;
const projectLocation = (id, filter, priority, range, query = '') => `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}${searchSuffix(query)}`;
const clientScript = readFileSync(new URL('./client.js', import.meta.url));

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <script src="/client.js" defer></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17263d; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input { font: inherit; padding: 10px 12px; border: 1px solid #8593a8; border-radius: 6px; width: 100%; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 6px; padding: 10px 16px; color: white; background: #2459b8; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: .6; }
    button:hover { background: #18438f; }
    :focus-visible { outline: 3px solid #db8c12; outline-offset: 3px; }
    .create { display: grid; gap: 12px; margin-bottom: 32px; }
    .create button { justify-self: start; }
    .project { display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dce2eb; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .navigation { margin-bottom: 24px; }
    select { font: inherit; padding: 8px 12px; margin-bottom: 16px; }
    .task { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 16px 0; border-top: 1px solid #dce2eb; }
    .task-completion { display: flex; gap: 12px; align-items: center; flex: 1; }
    .task input[type="checkbox"] { width: 20px; height: 20px; margin: 0; cursor: pointer; flex-shrink: 0; }
    .task-rename { display: grid; gap: 8px; }
    .task-rename button { justify-self: start; }
    .task span { overflow-wrap: anywhere; min-width: 0; }
    [role="alert"] { color: #a32323; margin: 0 0 16px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active', query = '') {
  const searchField = `<input type="hidden" name="search" value="${escape(query)}">`;
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      ${searchField}
      <div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div>
      <button type="submit">Create project</button>
    </form>
    <form action="/" method="get">
      ${searchField}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <div><label for="project-search">Project search</label><input id="project-search" name="search" type="text" value="${escape(query)}"></div>
      <button type="submit">Search projects</button>
    </form>
    <section aria-label="Projects">${listProjects.all(filter === 'Archived' ? 1 : 0).filter(project => matchesSearch(project.name, query)).map(project => `
      <div class="project" data-testid="project-row">
        <span>${escape(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}" method="post">
          ${searchField}
          <button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, query = '') {
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || !eligibleDestinations.length;
  const appliedFields = `<input type="hidden" name="search" value="${escape(query)}"><input type="hidden" name="dueFrom" value="${range.from}"><input type="hidden" name="dueThrough" value="${range.through}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    matchesSearch(task.title, query) &&
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(`<h1>${escape(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="navigation" action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
      <div><label for="new-project-name">New project name</label><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}></div>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form action="/projects/${project.id}/default-priority" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
      <div><label for="task-title">Task title</label><input id="task-title" name="title" type="text"></div>
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form action="/projects/${project.id}" method="get">
      ${appliedFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/due-range" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
      <div><label for="due-from">Due from</label><input id="due-from" name="rangeFrom" type="text" value="${range.from}"></div>
      <div><label for="due-through">Due through</label><input id="due-through" name="rangeThrough" type="text" value="${range.through}"></div>
      <button type="submit">Apply due range</button>
    </form>
    <form class="create" action="/projects/${project.id}" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">
      <div><label for="task-search">Task search</label><input id="task-search" name="search" type="text" value="${escape(query)}"></div>
      <button type="submit">Search tasks</button>
    </form>
    <section aria-label="Tasks">${tasks.map(task => `
      <div class="task" data-testid="task-row">
      <form class="task-completion" action="/projects/${project.id}/tasks/${task.id}" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
        <input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        <span>${escape(task.title)}</span>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
        <div><label for="new-task-title-${task.id}">New task title</label><input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
      </form>
      <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${priorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
        </select>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
      ${appliedFields}
        <div><label for="task-due-date-${task.id}">Task due date</label><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escape(task.due_date)}"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/move" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${appliedFields}
        <label for="destination-project-${task.id}">Destination project</label>
        <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
          ${eligibleDestinations.map(destination => `<option value="${destination.id}">${escape(destination.name)}</option>`).join('')}
        </select>
        <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
      </form>
      </div>`).join('')}</section>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/client.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(clientScript);
    } else if (request.method === 'GET' && pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter')), searchQuery(url.searchParams)));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 200, projectsPage('Project name is required', projectFilter(form.get('filter')), searchQuery(form)));
        return;
      }
      createProject.run(name);
      redirect(response, listLocation(projectFilter(form.get('filter')), searchQuery(form)));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/due-range$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const query = searchQuery(form);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = appliedRange(form);
      const from = (form.get('rangeFrom') || '').trim();
      const through = (form.get('rangeThrough') || '').trim();
      const error = dueRangeError(from, through);
      if (error) {
        html(response, 200, projectPage(project, filter, error, priority, previous, query));
        return;
      }
      redirect(response, projectLocation(id, filter, priority, { from, through }, query));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const query = searchQuery(form);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range, query));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 200, projectPage(project, filter, 'Project name is required', priority, range, query));
        return;
      }
      renameProject.run(name, id);
      redirect(response, projectLocation(id, filter, priority, range, query));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const query = searchQuery(form);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range, query));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!priorities.includes(defaultPriority)) {
        html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, range, query));
        return;
      }
      setDefaultPriority.run(defaultPriority, id);
      redirect(response, projectLocation(id, filter, priority, range, query));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(pathname)) {
      const [, , projectId, action] = pathname.split('/');
      const id = Number(projectId);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, id);
      redirect(response, listLocation(action === 'archive' ? 'Active' : 'Archived', searchQuery(form)));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*(?:\/(?:rename|priority|due-date|move))?)?$/.test(pathname)) {
      const [, , projectId, , taskId, action] = pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const query = searchQuery(form);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range, query));
        return;
      }
      if (taskId) {
        const task = Number(taskId);
        if (!Number.isSafeInteger(task) || !findTask.get(task, id)) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
        if (action === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(response, 200, projectPage(project, filter, 'Task title is required', priority, range, query));
            return;
          }
          renameTask.run(title, task, id);
        } else if (action === 'priority') {
          const newPriority = form.get('priority');
          if (!priorities.includes(newPriority)) {
            html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, range, query));
            return;
          }
          setTaskPriority.run(newPriority, task, id);
        } else if (action === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            html(response, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority, range, query));
            return;
          }
          setTaskDueDate.run(dueDate, task, id);
        } else if (action === 'move') {
          const destinationId = Number(form.get('destination'));
          const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
          if (!destination || destination.archived || destinationId === id) {
            html(response, 400, projectPage(project, filter, 'Choose an active destination project', priority, range, query));
            return;
          }
          moveTask(task, id, destinationId);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, task, id);
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 200, projectPage(project, filter, 'Task title is required', priority, range, query));
          return;
        }
        createTask(id, title, project.default_priority);
      }
      redirect(response, projectLocation(id, filter, priority, range, query));
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedRange(url.searchParams), searchQuery(url.searchParams)));
      } else {
        html(response, 404, page('<h1>Project not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>'));
      }
    } else {
      html(response, 404, page('<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Unable to complete request</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
