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
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const projectFilter = value => value === 'Archived' ? 'Archived' : 'Active';
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
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
const projectLocation = (id, filter, priority, range) => `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}`;
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

function projectsPage(error = '', filter = 'Active') {
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div>
      <button type="submit">Create project</button>
    </form>
    <form action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects">${listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
      <div class="project" data-testid="project-row">
        <span>${escape(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}" method="post">
          <button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}"><input type="hidden" name="dueThrough" value="${range.through}">`;
  const tasks = listTasks.all(project.id).filter(task =>
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
      ${rangeFields}
      <div><label for="new-project-name">New project name</label><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}></div>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form action="/projects/${project.id}/default-priority" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
      <div><label for="task-title">Task title</label><input id="task-title" name="title" type="text"></div>
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form action="/projects/${project.id}" method="get">
      ${rangeFields}
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
      ${rangeFields}
      <div><label for="due-from">Due from</label><input id="due-from" name="rangeFrom" type="text" value="${range.from}"></div>
      <div><label for="due-through">Due through</label><input id="due-through" name="rangeThrough" type="text" value="${range.through}"></div>
      <button type="submit">Apply due range</button>
    </form>
    <section aria-label="Tasks">${tasks.map(task => `
      <div class="task" data-testid="task-row">
      <form class="task-completion" action="/projects/${project.id}/tasks/${task.id}" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
        <input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        <span>${escape(task.title)}</span>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
        <div><label for="new-task-title-${task.id}">New task title</label><input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
      </form>
      <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${priorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
        </select>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields}
        <div><label for="task-due-date-${task.id}">Task due date</label><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escape(task.due_date)}"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
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
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        html(response, 413, page('<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 200, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
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
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = appliedRange(form);
      const from = (form.get('rangeFrom') || '').trim();
      const through = (form.get('rangeThrough') || '').trim();
      const error = dueRangeError(from, through);
      if (error) {
        html(response, 200, projectPage(project, filter, error, priority, previous));
        return;
      }
      redirect(response, projectLocation(id, filter, priority, { from, through }));
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
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 200, projectPage(project, filter, 'Project name is required', priority, range));
        return;
      }
      renameProject.run(name, id);
      redirect(response, projectLocation(id, filter, priority, range));
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
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!priorities.includes(defaultPriority)) {
        html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, range));
        return;
      }
      setDefaultPriority.run(defaultPriority, id);
      redirect(response, projectLocation(id, filter, priority, range));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(pathname)) {
      const [, , projectId, action] = pathname.split('/');
      const id = Number(projectId);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, id);
      redirect(response, action === 'archive' ? '/' : '/?filter=Archived');
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*(?:\/(?:rename|priority|due-date))?)?$/.test(pathname)) {
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
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = appliedRange(form);
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range));
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
            html(response, 200, projectPage(project, filter, 'Task title is required', priority, range));
            return;
          }
          renameTask.run(title, task, id);
        } else if (action === 'priority') {
          const newPriority = form.get('priority');
          if (!priorities.includes(newPriority)) {
            html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, range));
            return;
          }
          setTaskPriority.run(newPriority, task, id);
        } else if (action === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            html(response, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority, range));
            return;
          }
          setTaskDueDate.run(dueDate, task, id);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, task, id);
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 200, projectPage(project, filter, 'Task title is required', priority, range));
          return;
        }
        createTask.run(id, title, project.default_priority);
      }
      redirect(response, projectLocation(id, filter, priority, range));
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedRange(url.searchParams)));
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
