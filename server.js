import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
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
// Migrate databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks gain the same default as newly created tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Defaults are project-owned; migration must not change existing task priorities.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Dates are stored as calendar-day strings, never timezone-converted timestamps.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Seed existing order from IDs; moves append without changing task identity.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?) WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && !(from && through && from > through)
    ? { from, through } : { from: '', through: '' };
}

function projectLocation(id, filter, priority, range = { from: '', through: '' }) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  return `/projects/${id}${query.size ? `?${query}` : ''}`;
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #17263b; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 4px 24px #17263b0d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input[type="text"], select { width: 100%; padding: 12px; border: 1px solid #8491a4; border-radius: 6px; font: inherit; }
    button { padding: 11px 18px; border: 0; border-radius: 6px; background: #2156b5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #17428f; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .project { flex-wrap: wrap; }
    .project-info { flex: 1; }
    .project-info span { display: block; }
    :focus-visible { outline: 3px solid #d28c00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks, .filter { margin-top: 32px; }
    .task { padding: 18px 0; border-top: 1px solid #e1e6ed; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task input[type="checkbox"] { flex-shrink: 0; width: 20px; height: 20px; }
    .task .create label { margin-bottom: 8px; font-weight: 600; }
    .back { margin-bottom: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #e1e6ed; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { background: #fff0ef; color: #a12216; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', name = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <div class="project" data-testid="project-row">
      <div class="project-info">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      </div>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
          <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}`;
  const destinations = listProjects.all(0).filter(destination => destination.id !== project.id);
  const moveDisabled = project.archived || !destinations.length;
  const rows = listTasks.all(project.id)
    .filter(task => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority)
      && (!(range.from || range.through) || (task.due_date
        && (!range.from || task.due_date >= range.from)
        && (!range.through || task.due_date <= range.through))))
    .map(task => `
      <div class="task" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1"
            aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''}
            ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(value => `<option${value === task.priority ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/move" method="post">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="back" action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(value => `<option${value === project.default_priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(value => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <form class="filter create" action="/projects/${project.id}/due-range" method="post">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(range.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(range.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <section class="tasks" aria-label="Tasks">${rows || '<p>No matching tasks.</p>'}</section>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
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
      sendHtml(res, 200, projectsPage('', '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 400, projectsPage('Project name is required', '', form.get('filter') === 'Archived' ? 'Archived' : 'Active'));
        return;
      }
      createProject.run(name);
      redirect(res, '/');
      return;
    }
    const rangeMatch = /^\/projects\/([1-9]\d*)\/due-range$/.exec(url.pathname);
    if (rangeMatch && req.method === 'POST') {
      const id = Number(rangeMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const previous = dueRange(form);
        const from = (form.get('rangeFrom') || '').trim();
        const through = (form.get('rangeThrough') || '').trim();
        const error = !validDueDate(from) || !validDueDate(through)
          ? 'Due range must use valid YYYY-MM-DD dates'
          : from && through && from > through ? 'Due from must not be after Due through' : '';
        if (error) {
          sendHtml(res, 400, projectPage(project, filter, error, priority, previous));
          return;
        }
        redirect(res, projectLocation(id, filter, priority, { from, through }));
        return;
      }
    }
    const defaultMatch = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(url.pathname);
    if (defaultMatch && req.method === 'POST') {
      const id = Number(defaultMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, dueRange(form)));
          return;
        }
        if (!['Low', 'Normal', 'High'].includes(form.get('priority'))) {
          sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', priority, dueRange(form)));
          return;
        }
        setDefaultPriority.run(form.get('priority'), id);
        redirect(res, projectLocation(id, filter, priority, dueRange(form)));
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (renameMatch && req.method === 'POST') {
      const id = Number(renameMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, dueRange(form)));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(res, 400, projectPage(project, filter, 'Project name is required', priority, dueRange(form)));
          return;
        }
        renameProject.run(name, id);
        redirect(res, projectLocation(id, filter, priority, dueRange(form)));
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (archiveMatch && req.method === 'POST') {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        redirect(res, archiveMatch[2] === 'restore' ? '/?filter=Archived' : '/');
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date|move))?)?$/.exec(url.pathname);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project && req.method === 'GET' && url.pathname === `/projects/${id}`) {
        sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
        return;
      }
      if (project && req.method === 'POST' && url.pathname.includes('/tasks')) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, dueRange(form)));
          return;
        }
        if (match[2]) {
          const taskId = Number(match[2]);
          const existing = Number.isSafeInteger(taskId) && findTask.get(taskId, id);
          if (existing && match[3] === 'rename' && !(form.get('title') || '').trim()) {
            sendHtml(res, 400, projectPage(project, filter, 'Task title is required', priority, dueRange(form)));
            return;
          }
          if (existing && match[3] === 'priority' && !['Low', 'Normal', 'High'].includes(form.get('priority'))) {
            sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', priority, dueRange(form)));
            return;
          }
          const dueDate = (form.get('dueDate') || '').trim();
          if (existing && match[3] === 'due-date' && !validDueDate(dueDate)) {
            sendHtml(res, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority, dueRange(form)));
            return;
          }
          const destinationId = Number(form.get('destination'));
          if (existing && match[3] === 'move') {
            const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : null;
            if (!destination || destination.archived || destinationId === id) {
              sendHtml(res, 400, projectPage(project, filter, 'Choose an active destination project', priority, dueRange(form)));
              return;
            }
          }
          const changes = existing && (match[3] === 'move'
            ? moveTask.run(destinationId, destinationId, taskId, id).changes
            : match[3] === 'due-date'
            ? setTaskDueDate.run(dueDate, taskId, id).changes
            : match[3] === 'rename'
            ? renameTask.run(form.get('title').trim(), taskId, id).changes
            : match[3] === 'priority'
              ? setTaskPriority.run(form.get('priority'), taskId, id).changes
              : updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id).changes);
          if (!changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(res, 400, projectPage(project, filter, 'Task title is required', priority, dueRange(form)));
            return;
          }
          createTask.run(id, title, project.default_priority, id);
        }
        redirect(res, projectLocation(id, filter, priority, dueRange(form)));
        return;
      }
    }
    sendHtml(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (error.status !== 413) console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, page('Error', error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>'));
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
