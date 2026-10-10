import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
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
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
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
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
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

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #172338; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; }
    h1 { font-size: 2rem; margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { padding: 24px; background: white; border: 1px solid #d6dee9; border-radius: 10px; }
    .fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; border: 1px solid #79879a; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { background: #2459bd; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .summary { color: #526177; }
    button:hover { background: #194590; }
    :focus-visible { outline: 3px solid #e69400; outline-offset: 3px; }
    [role="alert"] { color: #9c2020; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 24px; border: 1px solid #d6dee9; border-radius: 10px; background: white; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project form { flex-shrink: 0; }
    .empty { color: #526177; }
    .navigation { margin-bottom: 24px; }
    .filter { margin-top: 24px; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #79879a; border-radius: 6px; background: white; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task { flex-direction: column; align-items: stretch; }
    .task input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task .rename label { margin-bottom: 8px; }
    @media (max-width: 540px) { main { margin: 20px auto; padding: 16px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main><script>
document.querySelectorAll('[data-autosubmit]').forEach(control => {
  control.addEventListener('change', () => control.form.requestSubmit());
});
</script></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" data-autosubmit>${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <section class="projects" aria-label="Projects">${projects.map((project) => `
      <div class="project" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <div class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</div></div>
        <div class="actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('')}${projects.length ? '' : `<p class="empty">No ${filter.toLowerCase()} projects.</p>`}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function dueRangeError(from, through) {
  if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) return 'Due from must not be after Due through';
  return '';
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return dueRangeError(from, through) ? { from: '', through: '' } : { from, through };
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">`;
}

function projectLocation(id, filter, priority, range) {
  const params = new URLSearchParams();
  if (filter !== 'All') params.set('filter', filter);
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  return `/projects/${id}${params.size ? `?${params}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="navigation" method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create navigation" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="new-project-name">New project name</label>
      <div class="fields"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form class="create navigation" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} data-autosubmit>${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="task-title">Task title</label>
      <div class="fields"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-autosubmit>${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" data-autosubmit>${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${range.from}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${range.through}">
      <button type="submit">Apply due range</button>
    </form>
    <section class="projects" aria-label="Tasks">${tasks.map(task => `
      <div class="project task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
          <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-autosubmit><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="fields"><input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} data-autosubmit>${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}</select>
        </form>
        <form class="rename" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="fields"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
        </form>
      </div>`).join('')}${tasks.length ? '' : '<p class="empty">No matching tasks.</p>'}</section>`);
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = projectFilter(form.get('filter'));
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', filter));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: filter === 'Archived' ? '/?filter=Archived' : '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(rename|default-priority|due-range)$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (url.pathname.endsWith('/due-range')) {
        const from = (form.get('rangeFrom') || '').trim();
        const through = (form.get('rangeThrough') || '').trim();
        const error = dueRangeError(from, through);
        if (error) {
          sendHtml(response, 400, projectPage(project, filter, error, priority, range));
          return;
        }
        response.writeHead(303, { Location: projectLocation(id, filter, priority, { from, through }) });
        response.end();
        return;
      }
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range));
        return;
      }
      if (url.pathname.endsWith('/default-priority')) {
        const defaultPriority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(defaultPriority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Task priority must be Low, Normal, or High', priority, range));
          return;
        }
        setDefaultPriority.run(defaultPriority, id);
      } else {
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, 'Project name is required', priority, range));
          return;
        }
        renameProject.run(name, id);
      }
      response.writeHead(303, { Location: projectLocation(id, filter, priority, range) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , rawId, action] = url.pathname.split('/');
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || !getProject.get(id)) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, id);
      response.writeHead(303, { Location: action === 'restore' ? '/?filter=Archived' : '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/(?:completion|rename|priority|due-date))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, range));
        return;
      }
      if (parts.length === 4) {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', priority, range));
          return;
        }
        insertTask.run(projectId, title, project.default_priority);
      } else {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !getTask.get(taskId, projectId)) {
          sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
        if (parts[5] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', priority, range));
            return;
          }
          renameTask.run(title, taskId, projectId);
        } else if (parts[5] === 'priority') {
          const taskPriority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(taskPriority)) {
            sendHtml(response, 400, projectPage(project, filter, 'Task priority must be Low, Normal, or High', priority, range));
            return;
          }
          setTaskPriority.run(taskPriority, taskId, projectId);
        } else if (parts[5] === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            sendHtml(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority, range));
            return;
          }
          setTaskDueDate.run(dueDate, taskId, projectId);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        }
      }
      response.writeHead(303, { Location: projectLocation(projectId, filter, priority, range) });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
