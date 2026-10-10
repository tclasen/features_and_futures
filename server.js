import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseDueDate, parseDueRange, matchesDueRange } from './due-date.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
// Upgrade existing databases without changing project IDs or task ownership.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
const taskPriorities = ['Low', 'Normal', 'High'];
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Positions belong to a project's task list; task IDs remain stable across moves.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`
    BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;
  `);
}
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id
  ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const createTask = database.prepare(`
  INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))
`);
const moveTask = database.prepare(`
  UPDATE tasks SET project_id = ?,
    position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE id = ? AND project_id = ?
`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

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
    body { margin: 0; background: #f4f6fa; color: #17243b; font: 17px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 30px #17243b0d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input { width: 100%; padding: 12px; border: 1px solid #8994a6; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244fc5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #193b99; }
    button:disabled { opacity: 0.6; cursor: default; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    :focus-visible { outline: 3px solid #e3a400; outline-offset: 3px; }
    .create button { margin-top: 16px; }
    .projects { margin-top: 32px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dce1ea; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .task { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 18px 0; border-top: 1px solid #dce1ea; overflow-wrap: anywhere; }
    .task input { width: auto; flex-shrink: 0; }
    .task label { margin: 0; min-width: 0; }
    .task .rename-task, .task .due-date { flex-basis: 100%; }
    .task .rename-task input, .task .due-date input { width: 100%; margin: 8px 0; }
    .filter { margin-top: 24px; }
    select { padding: 10px; font: inherit; }
    .back { margin-bottom: 24px; }
    [role="alert"] { color: #a11818; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } .project { align-items: flex-start; flex-direction: column; gap: 10px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function readTaskFilters(parameters) {
  const range = parseDueRange(parameters.get('rangeFrom') || '', parameters.get('rangeThrough') || '');
  return {
    dueRange: range.error ? { from: '', through: '' } : range,
    filter: ['Open', 'Completed'].includes(parameters.get('filter')) ? parameters.get('filter') : 'All',
    priorityFilter: taskPriorities.includes(parameters.get('priorityFilter')) ? parameters.get('priorityFilter') : 'All',
  };
}

function projectLocation(id, filter, priorityFilter, dueRange) {
  const parameters = new URLSearchParams({ filter });
  if (priorityFilter !== 'All') parameters.set('priorityFilter', priorityFilter);
  if (dueRange.from) parameters.set('rangeFrom', dueRange.from);
  if (dueRange.through) parameters.set('rangeThrough', dueRange.through);
  return `/projects/${id}?${parameters}`;
}

function projectPage(project, filter = 'All', error = '', priorityFilter = 'All', dueRange = { from: '', through: '' }) {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priorityFilter === 'All' || task.priority === priorityFilter) &&
    matchesDueRange(task.due_date, dueRange));
  const rangeInputs = `<input type="hidden" name="rangeFrom" value="${dueRange.from}">
      <input type="hidden" name="rangeThrough" value="${dueRange.through}">`;
  const filterInputs = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeInputs}`;
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <p role="alert" id="task-error"${error ? '' : ' hidden'}>${escapeHtml(error)}</p>
    <form class="create" method="post" action="/projects/${project.id}/rename">
      ${filterInputs}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      ${filterInputs}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}>${taskPriorities.map((priority) =>
        `<option${project.default_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}</select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      ${filterInputs}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeInputs}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">${['All', 'Open', 'Completed'].map((option) =>
        `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}</select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter">${['All', ...taskPriorities].map((option) =>
        `<option${priorityFilter === option ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      ${filterInputs}
      <label for="due-from">Due from</label>
      <input id="due-from" name="dueFrom" type="text" value="${dueRange.from}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="dueThrough" type="text" value="${dueRange.through}">
      <button type="submit">Apply due range</button>
    </form>
    <div>${tasks.map((task) => `
      <div class="task" data-testid="task-row">
        <input type="checkbox" id="task-${task.id}" data-task-id="${task.id}"
          aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterInputs}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority" data-task-priority${project.archived ? ' disabled' : ''}>${taskPriorities.map((priority) =>
            `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}</select>
        </form>
        <form class="rename-task" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterInputs}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="due-date" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterInputs}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${filterInputs}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>${destinations.map((destination) =>
            `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}</select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
      </div>`).join('')}${tasks.length ? '' : '<p>No tasks to show.</p>'}</div>
    <script>
      ['task-filter', 'priority-filter', 'default-task-priority'].forEach((id) => {
        document.getElementById(id).addEventListener('change', (event) => {
          event.target.form.requestSubmit();
        });
      });
      document.querySelectorAll('[data-task-priority]').forEach((select) => {
        select.addEventListener('change', () => select.form.requestSubmit());
      });
      document.querySelectorAll('[data-task-id]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          const alert = document.getElementById('task-error');
          try {
            const response = await fetch('/projects/${project.id}/tasks/' + checkbox.dataset.taskId, {
              method: 'POST',
              body: new URLSearchParams({ completed: checkbox.checked ? '1' : '0' }),
            });
            if (!response.ok) throw new Error('Unable to save task');
            alert.hidden = true;
            if (document.getElementById('task-filter').value !== 'All' ||
                document.getElementById('priority-filter').value !== 'All' ||
                ${Boolean(dueRange.from || dueRange.through)}) {
              window.location.reload();
            }
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            alert.textContent = 'Unable to save task. Please try again.';
            alert.hidden = false;
          } finally {
            checkbox.disabled = false;
          }
        });
      });
    </script>`);
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter">${['Active', 'Archived'].map((option) =>
        `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <div class="projects">${projects.map((project) => `
      <div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>
      </div>`).join('')}${projects.length ? '' : '<p>No projects yet.</p>'}</div>
    <script>
      document.getElementById('project-filter').addEventListener('change', (event) => {
        event.target.form.requestSubmit();
      });
    </script>`);
}

function sendHtml(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)(?:\/(?:tasks(?:\/([1-9]\d*)(\/(?:rename|priority|due-date|move))?)?|archive|restore|rename|default-priority|due-range))?$/.exec(pathname);
    if (projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        if (request.method === 'POST' && (pathname === `/projects/${id}/archive` || pathname === `/projects/${id}/restore`)) {
          const archived = pathname.endsWith('/archive');
          updateProjectArchive.run(archived ? 1 : 0, id);
          response.writeHead(303, { Location: archived ? '/' : '/?filter=Archived' });
          response.end();
          return;
        }
        if (request.method === 'GET' && pathname === `/projects/${id}`) {
          const { filter, priorityFilter, dueRange } = readTaskFilters(url.searchParams);
          sendHtml(response, 200, projectPage(project, filter, '', priorityFilter, dueRange));
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/due-range`) {
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          const range = parseDueRange(form.get('dueFrom') || '', form.get('dueThrough') || '');
          if (range.error) {
            sendHtml(response, 400, projectPage(project, filter, range.error, priorityFilter, dueRange));
            return;
          }
          response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, range) });
          response.end();
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/default-priority`) {
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project', priorityFilter, dueRange));
            return;
          }
          const priority = form.get('priority');
          if (!taskPriorities.includes(priority)) {
            sendHtml(response, 400, projectPage(currentProject, filter, 'Invalid task priority', priorityFilter, dueRange));
            return;
          }
          updateProjectDefaultPriority.run(priority, id);
          response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, dueRange) });
          response.end();
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/rename`) {
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project', priorityFilter, dueRange));
            return;
          }
          const name = (form.get('name') || '').trim();
          if (!name) {
            sendHtml(response, 400, projectPage(currentProject, filter, 'Project name is required', priorityFilter, dueRange));
            return;
          }
          renameProject.run(name, id);
          response.writeHead(303, { Location: filter === 'All' && priorityFilter === 'All' && !dueRange.from && !dueRange.through ? `/projects/${id}` : projectLocation(id, filter, priorityFilter, dueRange) });
          response.end();
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/tasks`) {
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project', priorityFilter, dueRange));
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', priorityFilter, dueRange));
            return;
          }
          createTask.run(id, title, currentProject.default_priority, id);
          response.writeHead(303, { Location: filter === 'All' && priorityFilter === 'All' && !dueRange.from && !dueRange.through ? `/projects/${id}` : projectLocation(id, filter, priorityFilter, dueRange) });
          response.end();
          return;
        }
        if (request.method === 'POST' && projectRoute[2] && projectRoute[3]) {
          const taskId = Number(projectRoute[2]);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, id)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project', priorityFilter, dueRange));
            return;
          }
          if (projectRoute[3] === '/move') {
            const destinationValue = form.get('destinationProject') || '';
            const destinationId = /^[1-9]\d*$/.test(destinationValue) ? Number(destinationValue) : NaN;
            const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
            if (!destination || destination.archived || destinationId === id) {
              sendHtml(response, 400, projectPage(currentProject, filter, 'Choose an active destination project', priorityFilter, dueRange));
              return;
            }
            if (!moveTask.run(destinationId, destinationId, taskId, id).changes) {
              sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
              return;
            }
            response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, dueRange) });
            response.end();
            return;
          }
          if (projectRoute[3] === '/due-date') {
            const dueDate = parseDueDate(form.get('dueDate') || '');
            if (dueDate === null) {
              sendHtml(response, 400, projectPage(currentProject, filter, 'Due date must be a valid YYYY-MM-DD date', priorityFilter, dueRange));
              return;
            }
            updateTaskDueDate.run(dueDate, taskId, id);
            response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, dueRange) });
            response.end();
            return;
          }
          if (projectRoute[3] === '/priority') {
            const priority = form.get('priority');
            if (!taskPriorities.includes(priority)) {
              sendHtml(response, 400, projectPage(currentProject, filter, 'Invalid task priority', priorityFilter, dueRange));
              return;
            }
            updateTaskPriority.run(priority, taskId, id);
            response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, dueRange) });
            response.end();
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(currentProject, filter, 'Task title is required', priorityFilter, dueRange));
            return;
          }
          renameTask.run(title, taskId, id);
          response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, dueRange) });
          response.end();
          return;
        }
        if (request.method === 'POST' && projectRoute[2]) {
          const taskId = Number(projectRoute[2]);
          const form = await readForm(request);
          const { filter, priorityFilter, dueRange } = readTaskFilters(form);
          if (findProject.get(id).archived) {
            sendHtml(response, 403, projectPage(findProject.get(id), filter, 'Archived project', priorityFilter, dueRange));
            return;
          }
          const completed = form.get('completed');
          if (!['0', '1'].includes(completed)) {
            sendHtml(response, 400, page('Invalid completion', '<h1>Invalid completion state</h1>'));
            return;
          }
          if (Number.isSafeInteger(taskId) && updateTask.run(Number(completed), taskId, id).changes) {
            response.writeHead(204);
            response.end();
            return;
          }
        }
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
