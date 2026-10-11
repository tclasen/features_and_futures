import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
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
// Migrate databases created before archive support without changing IDs or tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive Normal without changing their identity or completion.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults affect future tasks only; existing tasks keep their priorities.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Dates are calendar strings, never timestamps; older tasks start without a date.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const completeTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
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
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through } : { from: '', through: '' };
}

function projectLocation(id, filter, priority, range = { from: '', through: '' }) {
  return `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}` +
    `${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}`;
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
    body { margin: 0; background: #f5f7fa; color: #182438; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 48px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 4px 20px #1824380d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"] { flex: 1; min-width: 180px; border: 1px solid #8795a8; border-radius: 6px; padding: 10px; font: inherit; }
    button { background: #2455b8; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; cursor: pointer; }
    button:disabled { background: #798393; cursor: not-allowed; }
    li { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #d28c16; outline-offset: 3px; }
    ul { padding: 0; list-style: none; margin: 28px 0 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #e0e6ee; padding: 16px 0; }
    .project-name, .task-title { overflow-wrap: anywhere; min-width: 0; }
    .task-form { margin-top: 24px; }
    .filter-form { margin-top: 24px; }
    select { padding: 8px; font: inherit; }
    .task-completion { display: flex; align-items: center; gap: 12px; margin: 0; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    li .completion-form { min-width: 0; flex-shrink: 1; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a22121; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button></div>
    </form>
    <form class="filter-form" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <ul>${projects.map(project => `<li data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
        <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </li>`).join('')}</ul>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-form" method="post" action="/projects/${project.id}/rename">
      ${rangeFields}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <div class="fields"><input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form class="task-form" method="post" action="/projects/${project.id}/default-priority">
      ${rangeFields}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-form" method="post" action="/projects/${project.id}/tasks">
      ${rangeFields}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <div class="fields"><input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter-form" method="get" action="/projects/${project.id}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter-form" method="post" action="/projects/${project.id}/due-range">
      ${rangeFields}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${range.from}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${range.through}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <ul>${tasks.map(task => `<li data-testid="task-row">
      <form class="completion-form" method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
        ${rangeFields}
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <label class="task-completion"><input type="checkbox" name="completed" value="1"
          aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}
          onchange="this.form.requestSubmit()"><span class="task-title">${escapeHtml(task.title)}</span></label>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
        ${rangeFields}
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
        ${rangeFields}
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <label for="task-due-date-${task.id}">Task due date</label>
        <div class="fields"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
        ${rangeFields}
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="fields"><input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
    </li>`).join('')}</ul>`);
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
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      const name = (body.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required', projectFilter(body.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const rangeMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/due-range$/);
    if (request.method === 'POST' && rangeMatch) {
      const project = findProject.get(rangeMatch[1]);
      if (project) {
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        const from = (body.get('from') || '').trim();
        const through = (body.get('through') || '').trim();
        const error = !validDueDate(from) || !validDueDate(through)
          ? 'Due range must use valid YYYY-MM-DD dates'
          : from && through && from > through ? 'Due from must not be after Due through' : '';
        if (error) {
          sendHtml(response, 400, projectPage(project, filter, error, priority, dueRange(body)));
        } else {
          redirect(response, projectLocation(project.id, filter, priority, { from, through }));
        }
        return;
      }
    }
    const defaultMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/default-priority$/);
    if (request.method === 'POST' && defaultMatch) {
      const project = findProject.get(defaultMatch[1]);
      if (project) {
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', selectedPriority, dueRange(body)));
          return;
        }
        const priority = body.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(body)));
          return;
        }
        setDefaultPriority.run(priority, project.id);
        redirect(response, projectLocation(project.id, filter, selectedPriority, dueRange(body)));
        return;
      }
    }
    const renameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (request.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (project) {
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', priority, dueRange(body)));
          return;
        }
        const name = (body.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, 'Project name is required', priority, dueRange(body)));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, priority, dueRange(body)));
        return;
      }
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch) {
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
        return;
      }
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date))?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', selectedPriority, dueRange(body)));
          return;
        }
        if (taskMatch[2]) {
          const title = (body.get('title') || '').trim();
          if (taskMatch[3] === 'rename' && !title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(body)));
            return;
          }
          const priority = body.get('priority');
          if (taskMatch[3] === 'priority' && !['Low', 'Normal', 'High'].includes(priority)) {
            sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(body)));
            return;
          }
          const dueDate = (body.get('dueDate') || '').trim();
          if (taskMatch[3] === 'due-date' && !validDueDate(dueDate)) {
            sendHtml(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, dueRange(body)));
            return;
          }
          let result;
          if (taskMatch[3] === 'due-date') {
            result = setTaskDueDate.run(dueDate, taskMatch[2], project.id);
          } else if (taskMatch[3] === 'rename') {
            result = renameTask.run(title, taskMatch[2], project.id);
          } else if (taskMatch[3] === 'priority') {
            result = setTaskPriority.run(priority, taskMatch[2], project.id);
          } else {
            result = completeTask.run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (body.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(body)));
            return;
          }
          createTask.run(project.id, title, project.default_priority);
        }
        redirect(response, projectLocation(project.id, filter, selectedPriority, dueRange(body)));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      const status = error.status || 500;
      const title = status === 413 ? 'Request too large' : 'Server error';
      sendHtml(response, status, page(title, `<h1>${title}</h1>`));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
