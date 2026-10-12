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
// Upgrade databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing projects start with Normal without changing their existing tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Existing tasks retain their original Normal priority on migration.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// A missing due date is represented by an empty string, including on migration.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// IDs retain identity; sort_order records creation and subsequent move order.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET sort_order = id');
}
// Remember positions even while tasks belong to a different project.
// Seed current memberships from the previous ordering without rearranging tasks.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
    SELECT id, project_id, sort_order FROM tasks;
`);
const priorities = ['Low', 'Normal', 'High'];
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT OR IGNORE INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const getPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const getOwnedTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const relocateTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');

function transaction(operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  return transaction(() => {
    const { position } = nextPosition.get(projectId);
    const result = insertTask.run(projectId, title, priority, position);
    rememberPosition.run(result.lastInsertRowid, projectId, position);
    return result;
  });
}

function moveTask(destinationId, taskId, sourceId) {
  return transaction(() => {
    if (!getOwnedTask.get(taskId, sourceId)) return { changes: 0 };
    const remembered = getPosition.get(taskId, destinationId);
    const position = remembered?.position ?? nextPosition.get(destinationId).position;
    if (!remembered) rememberPosition.run(taskId, destinationId, position);
    return relocateTask.run(destinationId, position, taskId, sourceId);
  });
}
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
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
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #18243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border: 1px solid #dce2ed; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 10px; border: 1px solid #8895aa; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244bb5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #183987; }
    button:disabled { background: #8895aa; cursor: not-allowed; }
    .project { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #bb7c00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks { margin-top: 28px; }
    .task { border-top: 1px solid #dce2ed; padding: 16px 0; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    input[type="checkbox"] { width: auto; flex-shrink: 0; }
    select { padding: 10px; font: inherit; }
    .filter, .task-create { margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #dce2ed; padding: 16px 0; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { padding: 12px; background: #fff0ef; color: #95231b; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
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
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
      ${projects.length ? '' : '<p>No projects yet.</p>'}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function rangeError(range) {
  if (!validDueDate(range.from) || !validDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

function appliedRange(params) {
  const range = {
    from: (params.get('dueFrom') || '').trim(),
    through: (params.get('dueThrough') || '').trim(),
  };
  return rangeError(range) ? { from: '', through: '' } : range;
}

function projectLocation(projectId, filter, priority, range) {
  let location = `/projects/${projectId}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
  if (range?.from) location += `&dueFrom=${range.from}`;
  if (range?.through) location += `&dueThrough=${range.through}`;
  return location;
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, draft = range) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${range.from}">
    <input type="hidden" name="dueThrough" value="${range.through}">`;
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">${rangeFields}`;
  const destinations = listProjects.all(0).filter((destination) => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
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
    <form class="create" method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create task-create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(draft.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(draft.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <section class="tasks" aria-label="Tasks">
      ${tasks.map((task) => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${filterFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${filterFields}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${moveDisabled ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
      </div>`).join('')}
      ${tasks.length ? '' : '<p>No tasks to show.</p>'}
    </section>`);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const filter = projectFilter(form.get('filter'));
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required', filter));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: filter === 'Active' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const result = setProjectArchived.run(action === 'archive' ? 1 : 0, projectId);
      if (!result.changes) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), appliedRange(url.searchParams)));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/due-range$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = { from: (form.get('from') || '').trim(), through: (form.get('through') || '').trim() };
      const error = rangeError(range);
      if (error) {
        html(response, 400, projectPage(project, filter, error, priority, appliedRange(form), range));
        return;
      }
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, range) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/default-priority$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority, appliedRange(form)));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!priorities.includes(defaultPriority)) {
        html(response, 400, projectPage(project, filter, 'Invalid task priority', priority, appliedRange(form)));
        return;
      }
      setDefaultPriority.run(defaultPriority, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, appliedRange(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority, appliedRange(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectPage(project, filter, 'Project name is required', priority, appliedRange(form)));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priority, appliedRange(form)) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*(?:\/(?:rename|priority|due-date|move))?)?$/.test(url.pathname)) {
      const [, , projectId, , taskId, action] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const prioritySelection = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', prioritySelection, appliedRange(form)));
        return;
      }
      if (taskId) {
        let result;
        if (action === 'move') {
          const destinationId = form.get('destination');
          const destination = /^[1-9]\d*$/.test(destinationId || '') ? getProject.get(destinationId) : null;
          if (!destination || destination.archived || destination.id === project.id) {
            html(response, 400, projectPage(project, filter, 'Choose an active destination project', prioritySelection, appliedRange(form)));
            return;
          }
          result = moveTask(destination.id, taskId, projectId);
        } else if (action === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, appliedRange(form)));
            return;
          }
          result = renameTask.run(title, taskId, projectId);
        } else if (action === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (!validDueDate(dueDate)) {
            html(response, 400, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', prioritySelection, appliedRange(form)));
            return;
          }
          result = setTaskDueDate.run(dueDate, taskId, projectId);
        } else if (action === 'priority') {
          const priority = form.get('priority');
          if (!priorities.includes(priority)) {
            html(response, 400, projectPage(project, filter, 'Invalid task priority', prioritySelection, appliedRange(form)));
            return;
          }
          result = setTaskPriority.run(priority, taskId, projectId);
        } else {
          result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        }
        if (!result.changes) {
          html(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 400, projectPage(project, filter, 'Task title is required', prioritySelection, appliedRange(form)));
          return;
        }
        createTask(projectId, title, project.default_priority);
      }
      response.writeHead(303, { Location: projectLocation(projectId, filter, prioritySelection, appliedRange(form)) });
      response.end();
    } else {
      html(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    html(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
