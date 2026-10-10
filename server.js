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
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
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
  db.exec('BEGIN; ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id; COMMIT;');
}
const priorities = ['Low', 'Normal', 'High'];
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const createTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE id = ? AND project_id = ?`);
const listDestinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id ASC');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id ASC`);

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
    body { margin: 0; background: #f4f6fa; color: #19253b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 16px; }
    h1 { margin: 0 0 24px; font-size: 32px; overflow-wrap: anywhere; }
    h2 { margin-top: 32px; font-size: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8a98ad; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 11px 16px; background: #254ec4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193a9c; }
    button:disabled { background: #788398; cursor: default; }
    :focus-visible { outline: 3px solid #bc6a00; outline-offset: 3px; }
    select { font: inherit; padding: 8px; border: 1px solid #8a98ad; border-radius: 6px; }
    .task-row { padding: 16px 0; border-top: 1px solid #dde3ed; overflow-wrap: anywhere; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 12px; }
    .filter { margin: 24px 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dde3ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    [role="alert"] { color: #a32121; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #59687e; }
    @media (max-width: 540px) { main { margin: 16px; padding: 20px; } .create, .project-row { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <section aria-labelledby="projects-heading"><h2 id="projects-heading">Projects</h2>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
      <div class="project-name"><span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span></div>
      <div class="project-actions">
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      <form method="post" action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}">
        <button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button>
      </form></div>
    </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </section>`);
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
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function dueRangeError(from, through) {
  if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (from && through && from > through) return 'Due from must not be after Due through';
  return '';
}

function appliedDueRange(params) {
  const from = params.get('dueFrom')?.trim() || '';
  const through = params.get('dueThrough')?.trim() || '';
  return dueRangeError(from, through) ? { from: '', through: '' } : { from, through };
}

function dueRangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
}

function projectLocation(id, filter, priority, range = { from: '', through: '' }) {
  return `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', selectedPriority = 'All', range = { from: '', through: '' }, draftRange = range) {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || !destinations.length;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (selectedPriority === 'All' || task.priority === selectedPriority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="filter" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
      <label for="new-project-name">New project name</label>
      <div class="create"><input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <section aria-labelledby="tasks-heading"><h2 id="tasks-heading">Tasks</h2>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(priority => `<option${project.default_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${dueRangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(option => `<option${selectedPriority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
      <label for="due-from">Due from</label>
      <input id="due-from" name="newDueFrom" type="text" value="${escapeHtml(draftRange.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="newDueThrough" type="text" value="${escapeHtml(draftRange.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? tasks.map(task => `<div class="task-row" data-testid="task-row">
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
        <input type="hidden" name="completed" value="0">
        <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
      <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="create"><input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
      <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
        <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${priorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
        </select>
      </form>
      <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      ${dueRangeFields(range)}
        <label for="task-due-date-${task.id}">Task due date</label>
        <div class="create"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
      </form>
      <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${selectedPriority}">
        ${dueRangeFields(range)}
        <label for="destination-project-${task.id}">Destination project</label>
        <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>
          ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
        </select>
        <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
      </form>
    </div>`).join('') : '<p class="empty">No matching tasks.</p>'}
    </section>`);
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      if (!body) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = body.get('name')?.trim() || '';
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required', projectFilter(body.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedDueRange(url.searchParams)));
        return;
      }
    }
    const rangeMatch = /^\/projects\/([1-9]\d*)\/due-range$/.exec(url.pathname);
    if (request.method === 'POST' && rangeMatch) {
      const id = Number(rangeMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        const range = appliedDueRange(body);
        const draftRange = {
          from: body.get('newDueFrom')?.trim() || '',
          through: body.get('newDueThrough')?.trim() || '',
        };
        const error = dueRangeError(draftRange.from, draftRange.through);
        if (error) {
          sendHtml(response, 422, projectPage(project, filter, error, selectedPriority, range, draftRange));
          return;
        }
        redirect(response, projectLocation(id, filter, selectedPriority, draftRange));
        return;
      }
    }
    const defaultMatch = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultMatch) {
      const id = Number(defaultMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        const range = appliedDueRange(body);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority, range));
          return;
        }
        const priority = body.get('priority');
        if (!priorities.includes(priority)) {
          sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority, range));
          return;
        }
        setDefaultPriority.run(priority, id);
        redirect(response, projectLocation(id, filter, selectedPriority, range));
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch) {
      const id = Number(renameMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        const range = appliedDueRange(body);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority, range));
          return;
        }
        const name = body.get('name')?.trim() || '';
        if (!name) {
          sendHtml(response, 422, projectPage(project, filter, 'Project name is required', selectedPriority, range));
          return;
        }
        renameProject.run(name, id);
        redirect(response, projectLocation(id, filter, selectedPriority, range));
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && getProject.get(id)) {
        setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(\/(?:rename|priority|due-date|move))?)?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const projectId = Number(taskMatch[1]);
      const taskId = taskMatch[2] ? Number(taskMatch[2]) : null;
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (project && (taskId === null || Number.isSafeInteger(taskId))) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        const range = appliedDueRange(body);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', selectedPriority, range));
          return;
        }
        if (taskId === null) {
          const title = body.get('title')?.trim() || '';
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required', selectedPriority, range));
            return;
          }
          createTask.run(projectId, title, project.default_priority, projectId);
        } else if (taskMatch[3] === '/move') {
          if (!getTask.get(taskId, projectId)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const destinationValue = body.get('destinationProject') || '';
          const destinationId = /^[1-9]\d*$/.test(destinationValue) ? Number(destinationValue) : NaN;
          const destination = Number.isSafeInteger(destinationId) ? getProject.get(destinationId) : undefined;
          if (!destination || destination.id === projectId || destination.archived) {
            sendHtml(response, 422, projectPage(project, filter, 'Select an active destination project', selectedPriority, range));
            return;
          }
          moveTask.run(destinationId, destinationId, taskId, projectId);
        } else if (taskMatch[3] === '/due-date') {
          if (!getTask.get(taskId, projectId)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const dueDate = body.get('dueDate')?.trim() || '';
          if (dueDate && !validDueDate(dueDate)) {
            sendHtml(response, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, range));
            return;
          }
          setTaskDueDate.run(dueDate, taskId, projectId);
        } else if (taskMatch[3] === '/priority') {
          if (!getTask.get(taskId, projectId)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const priority = body.get('priority');
          if (!priorities.includes(priority)) {
            sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority, range));
            return;
          }
          setTaskPriority.run(priority, taskId, projectId);
        } else if (taskMatch[3] === '/rename') {
          if (!getTask.get(taskId, projectId)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const title = body.get('title')?.trim() || '';
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required', selectedPriority, range));
            return;
          }
          renameTask.run(title, taskId, projectId);
        } else {
          const completed = body.getAll('completed').at(-1) === '1' ? 1 : 0;
          if (!updateTask.run(completed, taskId, projectId).changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, projectLocation(projectId, filter, selectedPriority, range));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
