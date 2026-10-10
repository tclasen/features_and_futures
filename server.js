import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
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
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
// Upgrade existing tasks without changing their identity or completion state.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Preserve legacy creation order while allowing moved tasks to append to a project.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Keep a slot even while its task is away. Seed current positions on upgrade.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
CREATE INDEX IF NOT EXISTS task_positions_project ON task_positions(project_id, position);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const priorities = ['Low', 'Normal', 'High'];
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date, notes FROM tasks WHERE project_id = ? ORDER BY position, id');
const rememberDestination = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?)
  FROM tasks WHERE id = ? AND project_id = ?`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = tasks.id AND project_id = ?)
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
const setTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?`);
const rememberCreatedTask = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
// Upgrade databases created before project archiving was introduced.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');

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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #1d2b40; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce3ed; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    select { font: inherit; padding: 8px; }
    .task-filter { margin-top: 24px; }
    input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    input { min-width: 0; flex: 1; padding: 10px; border: 1px solid #8b98aa; border-radius: 6px; font: inherit; }
    textarea { width: 100%; padding: 10px; border: 1px solid #8b98aa; border-radius: 6px; font: inherit; }
    button { background: #224fc0; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; cursor: pointer; }
    button:hover { background: #193c94; }
    button:disabled { background: #8b98aa; cursor: not-allowed; }
    li { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #cf8b0c; outline-offset: 3px; }
    ul { padding: 0; list-style: none; margin: 28px 0 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce3ed; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a41d26; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #58667b; margin-top: 28px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function matchesSearch(value, query) {
  const normalize = (text) => text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function searchQuery(fields) {
  return (fields.get('query') || '').trim();
}

function projectList(error = '', filter = 'Active', query = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter((project) => matchesSearch(project.name, query));
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" action="/" method="get">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="query" type="text" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search projects</button>
    </form>
    ${projects.length ? `<ul>${projects.map((project) => `
      <li data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function dueRange(fields) {
  const from = (fields.get('dueFrom') || '').trim();
  const through = (fields.get('dueThrough') || '').trim();
  if ((from && !validDueDate(from)) || (through && !validDueDate(through)) ||
      (from && through && from > through)) return { from: '', through: '' };
  return { from, through };
}

function projectUrl(id, filter, priority, range, query = '') {
  return `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, draft = range, query = '') {
  const destinations = listProjects.all(0).filter((destination) => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter((task) =>
    matchesSearch(task.title, query) &&
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
    <input type="hidden" name="dueThrough" value="${range.through}">`;
  const searchField = `<input type="hidden" name="query" value="${escapeHtml(query)}">`;
  const stateFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}`;
  const filterFields = `${stateFields}${searchField}`;
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-filter" action="/projects/${project.id}/rename" method="post">
      <label for="new-project-name">New project name</label>
      ${filterFields}
      <div class="create-fields">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="task-filter" action="/projects/${project.id}/default-priority" method="post">
      <label for="default-task-priority">Default task priority</label>
      ${filterFields}
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}/tasks" method="post">
      <label for="task-title">Task title</label>
      ${filterFields}
      <div class="create-fields">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      ${rangeFields}${searchField}
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      ${stateFields}
      <label for="task-search">Task search</label>
      <input id="task-search" name="query" type="text" value="${escapeHtml(query)}" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <form class="task-filter" action="/projects/${project.id}/due-range" method="post">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(draft.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(draft.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? `<ul>${tasks.map((task) => `
      <li data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form class="task-completion" action="/projects/${project.id}/tasks/${task.id}" method="post">
          ${filterFields}
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          <label for="task-priority-${task.id}">Task priority</label>
          ${filterFields}
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map((option) => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
          <label for="task-due-date-${task.id}">Task due date</label>
          ${filterFields}
          <div class="create-fields">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/notes" method="post">
          <label for="task-notes-${task.id}">Task notes</label>
          ${filterFields}
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived ? ' disabled' : ''}>
${escapeHtml(task.notes).replace(/\r/g, '&#13;')}</textarea>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save notes</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/move" method="post">
          <label for="destination-project-${task.id}">Destination project</label>
          ${filterFields}
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          <label for="new-task-title-${task.id}">New task title</label>
          ${filterFields}
          <div class="create-fields">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No matching tasks.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList('', searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active', searchQuery(searchParams)));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      const draft = { from: (form.get('from') || '').trim(), through: (form.get('through') || '').trim() };
      let error = '';
      if ((draft.from && !validDueDate(draft.from)) || (draft.through && !validDueDate(draft.through))) {
        error = 'Due range must use valid YYYY-MM-DD dates';
      } else if (draft.from && draft.through && draft.from > draft.through) {
        error = 'Due from must not be after Due through';
      }
      if (error) {
        sendHtml(response, 400, projectPage(project, filter, error, priority, range, draft, searchQuery(form)));
        return;
      }
      response.writeHead(303, { Location: projectUrl(project.id, filter, priority, draft, searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project', priority, range, range, searchQuery(form)));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!priorities.includes(defaultPriority)) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', priority, range, range, searchQuery(form)));
        return;
      }
      setDefaultPriority.run(defaultPriority, project.id);
      response.writeHead(303, { Location: projectUrl(project.id, filter, priority, range, searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project', priority, range, range, searchQuery(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectPage(project, filter, 'Project name is required', priority, range, range, searchQuery(form)));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectUrl(project.id, filter, priority, range, searchQuery(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(pathname)) {
      const [, , projectId, action] = pathname.split('/');
      if (!getProject.get(projectId)) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, projectId);
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(searchParams.get('filter')), '', priorityFilter(searchParams.get('priorityFilter')), dueRange(searchParams), undefined, searchQuery(searchParams)));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(?:rename|priority|due-date|move|notes))?)?$/.test(pathname)) {
      const [, , projectId, , taskId, action] = pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const prioritySelection = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project', prioritySelection, range, range, searchQuery(form)));
        return;
      }
      if (taskId) {
        let result;
        if (action === 'move') {
          const destination = getProject.get(form.get('destination') || '');
          if (!destination || destination.archived || destination.id === project.id) {
            sendHtml(response, 400, projectPage(project, filter, 'Destination must be another active project', prioritySelection, range, range, searchQuery(form)));
            return;
          }
          result = transaction(() => {
            rememberDestination.run(destination.id, destination.id, taskId, project.id);
            return moveTask.run(destination.id, destination.id, taskId, project.id);
          });
        } else if (action === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, range, range, searchQuery(form)));
            return;
          }
          result = renameTask.run(title, taskId, project.id);
        } else if (action === 'notes') {
          result = setTaskNotes.run(form.get('notes') || '', taskId, project.id);
        } else if (action === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            sendHtml(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', prioritySelection, range, range, searchQuery(form)));
            return;
          }
          result = setTaskDueDate.run(dueDate, taskId, project.id);
        } else if (action === 'priority') {
          const priority = form.get('priority');
          if (!priorities.includes(priority)) {
            sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection, range, range, searchQuery(form)));
            return;
          }
          result = setTaskPriority.run(priority, taskId, project.id);
        } else {
          result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        }
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, range, range, searchQuery(form)));
          return;
        }
        transaction(() => {
          const created = createTask.run(project.id, title, project.default_priority, project.id);
          rememberCreatedTask.run(created.lastInsertRowid);
        });
      }
      response.writeHead(303, { Location: projectUrl(project.id, filter, prioritySelection, range, searchQuery(form)) });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
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
