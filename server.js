import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
)`);
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  due_date TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT`);
}
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const setProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const createTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE id = ? AND project_id = ?`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  if ((from && !validDueDate(from)) || (through && !validDueDate(through)) ||
      (from && through && from > through)) return { from: '', through: '' };
  return { from, through };
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${range.from}">
      <input type="hidden" name="dueThrough" value="${range.through}">`;
}

function projectLocation(projectId, filter, priority, range) {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  return `/projects/${projectId}?${query}`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

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
    body { margin: 0; background: #f5f7fb; color: #17243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input[type="text"], select { width: 100%; padding: 12px; border: 1px solid #8b98ab; border-radius: 6px; font: inherit; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #2456b8; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #19428f; }
    button:disabled { background: #788397; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #c47b00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dce2ec; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    [role="alert"] { color: #a32020; margin-bottom: 16px; }
    .empty { color: #58677e; }
    .task-controls { margin-top: 24px; }
    .task-row { padding: 18px 0; border-top: 1px solid #dce2ec; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task-rename, .task-priority, .task-due-date, .task-move { margin-top: 12px; }
    .task-row .task-rename label, .task-row .task-priority label, .task-row .task-due-date label, .task-row .task-move label { display: block; margin-bottom: 8px; font-weight: 600; }
    .task-title { overflow-wrap: anywhere; min-width: 0; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <form class="task-controls" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((value) => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <div class="project-name"><span>${escapeHtml(project.name)}</span>
            <div data-testid="project-summary">${project.completed}/${project.total} completed</div>
          </div>
          <div class="project-actions">
            <form method="get" action="/projects/${project.id}">
              <button type="submit">Open project</button>
            </form>
            <form method="post" action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}">
              <button type="submit">${filter === 'Archived' ? 'Restore' : 'Archive'} project</button>
            </form>
          </div>
        </div>`).join('') : '<p class="empty">No projects in this filter.</p>'}
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || !destinations.length;
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create task-controls" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="task-controls" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map((value) => `<option value="${value}"${value === project.default_task_priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form class="create task-controls" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="task-controls" method="get" action="/projects/${project.id}">
      ${rangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((value) => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map((value) => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="create task-controls" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${range.from}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${range.through}">
      <button type="submit">Apply due range</button>
    </form>
    <section class="task-controls" aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `
        <div class="task-row" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span class="task-title">${escapeHtml(task.title)}</span></label>
            <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save completion</button></noscript>
          </form>
          <form class="create task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="new-task-title-${task.id}">New task title</label>
            <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </form>
          <form class="task-priority" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              ${taskPriorities.map((value) => `<option${value === task.priority ? ' selected' : ''}>${value}</option>`).join('')}
            </select>
            <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save priority</button></noscript>
          </form>
          <form class="create task-due-date" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="task-due-date-${task.id}">Task due date</label>
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </form>
          <form class="create task-move" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="destination-project-${task.id}">Destination project</label>
            <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>
              ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
            </select>
            <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
          </form>
        </div>`).join('') : '<p class="empty">No tasks match this filter.</p>'}
    </section>`);
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
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveRoute) {
      const result = setProjectArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, archiveRoute[1]);
      if (result.changes) {
        response.writeHead(303, { Location: archiveRoute[2] === 'archive' ? '/' : '/?filter=Archived' });
        response.end();
        return;
      }
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
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
        const previousRange = dueRange(form);
        const from = (form.get('rangeFrom') || '').trim();
        const through = (form.get('rangeThrough') || '').trim();
        let error = '';
        if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
          error = 'Due range must use valid YYYY-MM-DD dates';
        } else if (from && through && from > through) {
          error = 'Due from must not be after Due through';
        }
        if (error) {
          sendHtml(response, 400, projectPage(project, filter, error, priority, previousRange));
          return;
        }
        response.writeHead(303, { Location: projectLocation(project.id, filter, priority, { from, through }) });
        response.end();
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
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project defaults cannot be changed', prioritySelection, range));
          return;
        }
        const priority = form.get('priority');
        if (!taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection, range));
          return;
        }
        setProjectDefaultPriority.run(priority, project.id);
        response.writeHead(303, { Location: projectLocation(project.id, filter, prioritySelection, range) });
        response.end();
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
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be renamed', prioritySelection, range));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, 'Project name is required', prioritySelection, range));
          return;
        }
        renameProject.run(name, project.id);
        response.writeHead(303, { Location: projectLocation(project.id, filter, prioritySelection, range) });
        response.end();
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(?:\/(rename|priority|due-date|move))?)?$/.exec(url.pathname);
    if (request.method === 'POST' && taskRoute) {
      const project = findProject.get(taskRoute[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const prioritySelection = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project tasks cannot be changed', prioritySelection, range));
          return;
        }
        const taskId = taskRoute[2];
        if (taskId) {
          let result;
          if (taskRoute[3] === 'move') {
            const destinationId = form.get('destinationProject') || '';
            const destination = /^[1-9]\d*$/.test(destinationId) ? findProject.get(destinationId) : null;
            if (!destination || destination.archived || destination.id === project.id) {
              sendHtml(response, 400, projectPage(project, filter, 'Choose an active destination project', prioritySelection, range));
              return;
            }
            result = moveTask.run(destination.id, destination.id, taskId, project.id);
          } else if (taskRoute[3] === 'due-date') {
            const dueDate = (form.get('dueDate') || '').trim();
            if (dueDate && !validDueDate(dueDate)) {
              sendHtml(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', prioritySelection, range));
              return;
            }
            result = setTaskDueDate.run(dueDate, taskId, project.id);
          } else if (taskRoute[3] === 'priority') {
            const priority = form.get('priority');
            if (!taskPriorities.includes(priority)) {
              sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection, range));
              return;
            }
            result = setTaskPriority.run(priority, taskId, project.id);
          } else if (taskRoute[3] === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, range));
              return;
            }
            result = renameTask.run(title, taskId, project.id);
          } else {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, range));
            return;
          }
          createTask.run(project.id, title, project.default_task_priority, project.id);
        }
        response.writeHead(303, { Location: projectLocation(project.id, filter, prioritySelection, range) });
        response.end();
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
