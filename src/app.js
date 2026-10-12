import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate, normalizeDueRange } from './due-date.js';

const taskPriorities = ['Low', 'Normal', 'High'];
const taskFilters = ['All', 'Open', 'Completed'];
const priorityFilters = ['All', ...taskPriorities];

function readTaskFilters(parameters) {
  const filter = parameters.get('filter');
  const priorityFilter = parameters.get('priorityFilter');
  const range = normalizeDueRange(parameters.get('dueFrom') ?? '', parameters.get('dueThrough') ?? '');
  return {
    filter: taskFilters.includes(filter) ? filter : 'All',
    priorityFilter: priorityFilters.includes(priorityFilter) ? priorityFilter : 'All',
    dueFrom: range.dueFrom ?? '',
    dueThrough: range.dueThrough ?? '',
  };
}

function hiddenDueRange({ dueFrom, dueThrough }) {
  return `<input type="hidden" name="dueFrom" value="${dueFrom}"><input type="hidden" name="dueThrough" value="${dueThrough}">`;
}

function hiddenTaskFilters(filters) {
  return `<input type="hidden" name="filter" value="${filters.filter}"><input type="hidden" name="priorityFilter" value="${filters.priorityFilter}">${hiddenDueRange(filters)}`;
}

function projectLocation(id, { filter, priorityFilter, dueFrom, dueThrough }) {
  const parameters = new URLSearchParams({ filter });
  if (priorityFilter !== 'All') parameters.set('priorityFilter', priorityFilter);
  if (dueFrom) parameters.set('dueFrom', dueFrom);
  if (dueThrough) parameters.set('dueThrough', dueThrough);
  return `/projects/${id}?${parameters}`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f7fa; color: #182536; font-family: system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2e9; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .fields { display: flex; gap: 12px; flex-wrap: wrap; }
  input[type="text"] { flex: 1; min-width: 180px; padding: 12px; border: 1px solid #8290a0; border-radius: 6px; font: inherit; }
  input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
  select { padding: 10px; font: inherit; }
  .filter { margin-top: 24px; }
  button:disabled, input:disabled, select:disabled { cursor: default; opacity: 0.6; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { padding: 12px 18px; border: 1px solid #2056ad; border-radius: 6px; background: #2056ad; color: white; font: inherit; cursor: pointer; }
  :focus-visible { outline: 3px solid #d38b13; outline-offset: 3px; }
  ul { padding: 0; list-style: none; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid #dce2e9; padding: 18px 0; }
  .name { overflow-wrap: anywhere; min-width: 0; }
  li form { flex-shrink: 0; }
  [role="alert"] { color: #9d241e; }
  .empty { color: #566578; }
  @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createApp(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  )`);
  database.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  // Existing project databases predate archive state; migrate without replacing rows.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  // Default legacy tasks to Normal while preserving their identity and other state.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
  }
  // Project defaults affect only future tasks, including after database upgrades.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))");
  }
  // Legacy and new tasks have no due date until one is explicitly saved.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  // IDs retain task identity; positions track order within the current project.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
    database.exec(`BEGIN;
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id;
      COMMIT;`);
  }
  database.exec('CREATE INDEX IF NOT EXISTS tasks_project_position ON tasks(project_id, position, id)');
  const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id ASC');
  const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
    position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
    WHERE id = ? AND project_id = ?`);
  const listProjects = database.prepare(`SELECT projects.id, projects.name,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id ASC`);
  const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
  const updateDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare(`SELECT id, title, completed, priority, due_date FROM tasks
    WHERE project_id = ? AND (? = 'All' OR completed = ?)
      AND (? = 'All' OR priority = ?)
      AND (? = '' OR (due_date != '' AND due_date >= ?))
      AND (? = '' OR (due_date != '' AND due_date <= ?)) ORDER BY position ASC, id ASC`);
  const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
  const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
  const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
  const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

  function taskRow(task, project, destinations, filters, renameError, dueDateError) {
    const disabled = project.archived ? ' disabled' : '';
    return `<li data-testid="task-row"><span class="name">${escapeHtml(task.title)}</span>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">${hiddenTaskFilters(filters)}<input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${disabled} onchange="this.form.requestSubmit()"><noscript><button type="submit"${disabled}>Save completion</button></noscript></form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
${hiddenTaskFilters(filters)}
<label for="task-priority-${task.id}">Task priority</label>
<select id="task-priority-${task.id}" name="priority"${disabled} onchange="this.form.requestSubmit()">${taskPriorities.map((priority) => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}</select>
<noscript><button type="submit"${disabled}>Save priority</button></noscript>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
${hiddenTaskFilters(filters)}
<label for="new-task-title-${task.id}">New task title</label>
<div class="fields"><input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${disabled}${renameError ? ` aria-describedby="task-rename-error-${task.id}" aria-invalid="true"` : ''}><button type="submit"${disabled}>Rename task</button></div>
${renameError ? `<p id="task-rename-error-${task.id}" role="alert">${escapeHtml(renameError)}</p>` : ''}
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
${hiddenTaskFilters(filters)}
<label for="task-due-date-${task.id}">Task due date</label>
<div class="fields"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${disabled}${dueDateError ? ` aria-describedby="task-due-date-error-${task.id}" aria-invalid="true"` : ''}><button type="submit"${disabled}>Save due date</button></div>
${dueDateError ? `<p id="task-due-date-error-${task.id}" role="alert">${escapeHtml(dueDateError)}</p>` : ''}
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
${hiddenTaskFilters(filters)}
<label for="destination-project-${task.id}">Destination project</label>
<select id="destination-project-${task.id}" name="destinationProject"${project.archived || !destinations.length ? ' disabled' : ''}>${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}</select>
<button type="submit"${project.archived || !destinations.length ? ' disabled' : ''}>Move task</button>
</form></li>`;
  }

  function projectPage(project, filters, { taskError = '', renameError = '', taskRenameError = '', taskRenameId, priorityError = '', taskDueDateError = '', taskDueDateId, dueRangeError = '', rangeFrom = filters.dueFrom, rangeThrough = filters.dueThrough } = {}) {
    const { filter, priorityFilter, dueFrom, dueThrough } = filters;
    const destinations = listDestinations.all(project.id);
    const tasks = listTasks.all(project.id, filter, filter === 'Completed' ? 1 : 0, priorityFilter, priorityFilter, dueFrom, dueFrom, dueThrough, dueThrough);
    return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
<form action="/" method="get"><button type="submit">Projects</button></form>
${project.archived ? '<p>Archived project</p>' : ''}
<form method="post" action="/projects/${project.id}/rename">
${hiddenTaskFilters(filters)}
<label for="new-project-name">New project name</label>
<div class="fields"><input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}${renameError ? ' aria-describedby="rename-error" aria-invalid="true"' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
${renameError ? `<p id="rename-error" role="alert">${escapeHtml(renameError)}</p>` : ''}
</form>
<h2>Tasks</h2>
${priorityError ? `<p role="alert">${escapeHtml(priorityError)}</p>` : ''}
<form method="post" action="/projects/${project.id}/default-priority">
${hiddenTaskFilters(filters)}
<label for="default-task-priority">Default task priority</label>
<select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">${taskPriorities.map((priority) => `<option${priority === project.default_task_priority ? ' selected' : ''}>${priority}</option>`).join('')}</select>
<noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
</form>
<form method="post" action="/projects/${project.id}/tasks">
${hiddenTaskFilters(filters)}
<label for="task-title">Task title</label>
<div class="fields"><input id="task-title" name="title" type="text"${taskError ? ' aria-describedby="task-error" aria-invalid="true"' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
${taskError ? `<p id="task-error" role="alert">${escapeHtml(taskError)}</p>` : ''}
</form>
<form class="filter" method="get" action="/projects/${project.id}">
${hiddenDueRange(filters)}
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${taskFilters.map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
<label for="priority-filter">Priority filter</label>
<select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">${priorityFilters.map((option) => `<option${option === priorityFilter ? ' selected' : ''}>${option}</option>`).join('')}</select>
<noscript><button type="submit">Apply filters</button></noscript>
</form>
<form class="filter" method="post" action="/projects/${project.id}/due-range">
${hiddenTaskFilters(filters)}
<label for="due-from">Due from</label>
<input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(rangeFrom)}">
<label for="due-through">Due through</label>
<input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(rangeThrough)}">
<button type="submit">Apply due range</button>
${dueRangeError ? `<p role="alert">${escapeHtml(dueRangeError)}</p>` : ''}
</form>
${tasks.length ? `<ul>${tasks.map((task) => taskRow(task, project, destinations, filters, task.id === taskRenameId ? taskRenameError : '', task.id === taskDueDateId ? taskDueDateError : '')).join('')}</ul>` : '<p class="empty">No tasks match this filter.</p>'}`);
  }

  const normalizeProjectFilter = (value) => value === 'Archived' ? 'Archived' : 'Active';

  function projectsPage(filter = 'Active', error = '') {
    const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
    return page('Projects', `<h1>Workboard</h1>
<form method="post" action="/projects">
<input type="hidden" name="filter" value="${filter}">
<label for="project-name">Project name</label>
<div class="fields"><input id="project-name" name="name" type="text"${error ? ' aria-describedby="name-error" aria-invalid="true"' : ''}><button type="submit">Create project</button></div>
${error ? `<p id="name-error" role="alert">${escapeHtml(error)}</p>` : ''}
</form>
<h2>Projects</h2>
<form class="filter" method="get" action="/">
<label for="project-filter">Project filter</label>
<select id="project-filter" name="filter" onchange="this.form.requestSubmit()">${['Active', 'Archived'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
<noscript><button type="submit">Apply filter</button></noscript>
</form>
${projects.length ? `<ul>${projects.map((project) => `<li data-testid="project-row"><span class="name">${escapeHtml(project.name)}</span><span data-testid="project-summary">${project.completed}/${project.total} completed</span><div class="actions"><form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form><form method="post" action="/projects/${project.id}/${filter === 'Archived' ? 'restore' : 'archive'}"><button type="submit">${filter === 'Archived' ? 'Restore project' : 'Archive project'}</button></form></div></li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}`);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname;
      const projectRoute = pathname.match(/^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date|move))?|\/(archive|restore|rename|default-priority|due-range))?$/);
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        sendHtml(response, 200, projectsPage(normalizeProjectFilter(url.searchParams.get('filter'))));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          sendHtml(response, 422, projectsPage(normalizeProjectFilter(form.get('filter')), 'Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (projectRoute) {
        const id = Number(projectRoute[1]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
          return;
        }
        if (request.method === 'GET' && pathname === `/projects/${id}`) {
          sendHtml(response, 200, projectPage(project, readTaskFilters(url.searchParams)));
        } else if (request.method === 'POST' && projectRoute[4] === 'due-range') {
          const form = await readForm(request);
          const filters = readTaskFilters(form);
          const rangeFrom = form.get('rangeFrom') ?? '';
          const rangeThrough = form.get('rangeThrough') ?? '';
          const range = normalizeDueRange(rangeFrom, rangeThrough);
          if (range.error) {
            sendHtml(response, 422, projectPage(project, filters, {
              dueRangeError: range.error, rangeFrom, rangeThrough,
            }));
            return;
          }
          response.writeHead(303, { Location: projectLocation(id, { ...filters, ...range }) });
          response.end();
        } else if (request.method === 'POST' && projectRoute[4] === 'default-priority') {
          const form = await readForm(request);
          const currentProject = findProject.get(id);
          const filters = readTaskFilters(form);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filters, { priorityError: 'Archived project is read-only' }));
            return;
          }
          const priority = form.get('priority');
          if (!taskPriorities.includes(priority)) {
            sendHtml(response, 422, projectPage(currentProject, filters, { priorityError: 'Task priority must be Low, Normal, or High' }));
            return;
          }
          updateDefaultTaskPriority.run(priority, id);
          response.writeHead(303, { Location: projectLocation(id, filters) });
          response.end();
        } else if (request.method === 'POST' && projectRoute[4] === 'rename') {
          const form = await readForm(request);
          const currentProject = findProject.get(id);
          const filters = readTaskFilters(form);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filters, { renameError: 'Archived project is read-only' }));
            return;
          }
          const name = (form.get('name') ?? '').trim();
          if (!name) {
            sendHtml(response, 422, projectPage(currentProject, filters, { renameError: 'Project name is required' }));
            return;
          }
          renameProject.run(name, id);
          response.writeHead(303, { Location: projectLocation(id, filters) });
          response.end();
        } else if (request.method === 'POST' && projectRoute[4]) {
          updateArchive.run(projectRoute[4] === 'archive' ? 1 : 0, id);
          response.writeHead(303, { Location: projectRoute[4] === 'archive' ? '/' : '/?filter=Archived' });
          response.end();
        } else if (request.method === 'POST' && pathname.endsWith('/tasks')) {
          const form = await readForm(request);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, readTaskFilters(form), { taskError: 'Archived project is read-only' }));
            return;
          }
          const title = (form.get('title') ?? '').trim();
          const filters = readTaskFilters(form);
          if (!title) {
            sendHtml(response, 422, projectPage(currentProject, filters, { taskError: 'Task title is required' }));
            return;
          }
          insertTask.run(id, title, currentProject.default_task_priority, id);
          response.writeHead(303, { Location: projectLocation(id, filters) });
          response.end();
        } else if (request.method === 'POST' && projectRoute[2]) {
          const form = await readForm(request);
          if (findProject.get(id).archived) {
            sendHtml(response, 403, projectPage(findProject.get(id), readTaskFilters(form), { taskError: 'Archived project is read-only' }));
            return;
          }
          const taskId = Number(projectRoute[2]);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, id)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          if (projectRoute[3] === 'move') {
            const destinationValue = form.get('destinationProject') ?? '';
            const destinationId = /^[1-9]\d*$/.test(destinationValue) ? Number(destinationValue) : NaN;
            const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
            if (!destination || destination.archived || destinationId === id) {
              sendHtml(response, 422, projectPage(findProject.get(id), readTaskFilters(form), {
                taskError: 'Destination must be another active project',
              }));
              return;
            }
            moveTask.run(destinationId, destinationId, taskId, id);
          } else if (projectRoute[3] === 'due-date') {
            const dueDate = normalizeDueDate(form.get('dueDate') ?? '');
            if (dueDate === null) {
              sendHtml(response, 422, projectPage(findProject.get(id), readTaskFilters(form), {
                taskDueDateId: taskId, taskDueDateError: 'Due date must be a valid YYYY-MM-DD date',
              }));
              return;
            }
            updateTaskDueDate.run(dueDate, taskId, id);
          } else if (projectRoute[3] === 'rename') {
            const title = (form.get('title') ?? '').trim();
            if (!title) {
              sendHtml(response, 422, projectPage(findProject.get(id), readTaskFilters(form), {
                taskRenameId: taskId, taskRenameError: 'Task title is required',
              }));
              return;
            }
            renameTask.run(title, taskId, id);
          } else if (projectRoute[3] === 'priority') {
            const priority = form.get('priority');
            if (!taskPriorities.includes(priority)) {
              sendHtml(response, 422, projectPage(findProject.get(id), readTaskFilters(form), {
                priorityError: 'Task priority must be Low, Normal, or High',
              }));
              return;
            }
            updateTaskPriority.run(priority, taskId, id);
          } else {
            updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id);
          }
          response.writeHead(303, { Location: projectLocation(id, readTaskFilters(form)) });
          response.end();
        } else {
          sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
        }
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        sendHtml(response, error.status ?? 500, page('Error', '<h1>Unable to complete request</h1>'));
      } else {
        response.end();
      }
    }
  });
  server.on('close', () => database.close());
  return server;
}
