import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );
`);
// Upgrade databases created before project archiving was introduced.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing projects keep Normal as their default without changing any tasks.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
// Backfill priorities for tasks created before task priorities were introduced.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const taskPriorities = ['Low', 'Normal', 'High'];
// Tasks from earlier checkpoints have no due date.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Preserve the original creation order when upgrading existing task data.
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
// Remember order independently of current ownership. Seed older databases in
// their current order; absent tasks keep their slots when new tasks arrive.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY position, id)
  FROM tasks;
`);
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const updateDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
const listTasks = database.prepare(`
  SELECT tasks.id, title, completed, priority, due_date
  FROM tasks JOIN task_project_positions AS positions
    ON positions.task_id = tasks.id AND positions.project_id = tasks.project_id
  WHERE tasks.project_id = ? ORDER BY positions.position
`);
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const updateTaskProject = database.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');
const rememberTaskPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))
  ON CONFLICT (task_id, project_id) DO NOTHING
`);

function transaction(action) {
  database.exec('BEGIN');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  transaction(() => {
    const result = insertTask.run(projectId, title, priority);
    rememberTaskPosition.run(result.lastInsertRowid, projectId, projectId);
  });
}

function moveTask(destinationId, taskId, sourceId) {
  return transaction(() => {
    const result = updateTaskProject.run(destinationId, taskId, sourceId);
    if (result.changes) rememberTaskPosition.run(taskId, destinationId, destinationId);
    return result;
  });
}
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
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
    :root { font-family: system-ui, sans-serif; color: #182c3b; background: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 2.3rem; overflow-wrap: anywhere; }
    .card { background: white; padding: 24px; border: 1px solid #d8e1e7; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"], select { flex: 1; min-width: 180px; padding: 12px; border: 1px solid #899ca9; border-radius: 6px; font: inherit; }
    .filter { margin-top: 24px; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    .task .rename { margin-top: 16px; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #175b79; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #10465f; }
    button:disabled { background: #687d89; cursor: default; }
    :focus-visible { outline: 3px solid #c17400; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .project span { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project form { flex-shrink: 0; }
    .empty { color: #516574; }
    [role="alert"] { color: #a12626; margin-top: 0; }
    @media (max-width: 480px) { main { margin-top: 32px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(filter = 'Active', error = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <section class="card" aria-label="Create a project">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/projects">
        <input type="hidden" name="filter" value="${filter}">
        <label for="project-name">Project name</label>
        <div class="controls">
          <input id="project-name" name="name" type="text">
          <button type="submit">Create project</button>
        </div>
      </form>
    </section>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `
        <div class="card project" data-testid="project-row">
          <span>${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
          <div class="controls">
            <form method="get" action="/projects/${project.id}">
              <button type="submit">Open project</button>
            </form>
            <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
              <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
            </form>
          </div>
        </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create your first project above.'}</p>`}
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function dueRange(parameters) {
  const from = (parameters.get('dueFrom') || '').trim();
  const through = (parameters.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through } : { from: '', through: '' };
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${range.from}">
          <input type="hidden" name="dueThrough" value="${range.through}">`;
}

function projectLocation(projectId, filter, priority, range) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  return `/projects/${projectId}${query.size ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', priority = 'All', error = '', range = { from: '', through: '' }) {
  const destinations = listDestinations.all(project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date !== '' &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <section class="card" aria-label="Rename a project">
      <form method="post" action="/projects/${project.id}/rename">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <label for="new-project-name">New project name</label>
        <div class="controls">
          <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
        </div>
      </form>
    </section>
    <section class="card" aria-label="Create a task">
      <form class="filter" method="post" action="/projects/${project.id}/default-task-priority">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${taskPriorities.map(option => `<option${option === project.default_task_priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form method="post" action="/projects/${project.id}/tasks">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <label for="task-title">Task title</label>
        <div class="controls">
          <input id="task-title" name="title" type="text">
          <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
        </div>
      </form>
    </section>
    <form class="filter" method="get" action="/projects/${project.id}">
      ${rangeFields(range)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter card" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${range.from}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${range.through}">
      <button type="submit">Apply due range</button>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.length ? tasks.map(task => `
        <div class="card task" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label>
              <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
          <form class="rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="controls">
              <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
          </form>
          <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              ${taskPriorities.map(priority => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="task-due-date-${task.id}">Task due date</label>
            <div class="controls">
              <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
            </div>
          </form>
          <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <label for="destination-project-${task.id}">Destination project</label>
            <div class="controls">
              <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>
                ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
              </select>
              <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
            </div>
          </form>
        </div>`).join('') : '<p class="empty">No tasks match this filter.</p>'}
    </section>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) return null;
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
      sendHtml(response, 200, projectsPage(projectFilter(url.searchParams.get('filter'))));
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
        sendHtml(response, 422, projectsPage(projectFilter(form.get('filter')), 'Project name is required'));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const defaultPriorityMatch = /^\/projects\/(\d+)\/default-task-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const project = findProject.get(defaultPriorityMatch[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Restore this project before changing its default task priority.', range));
          return;
        }
        const newPriority = form.get('priority');
        if (!taskPriorities.includes(newPriority)) {
          sendHtml(response, 422, projectPage(project, filter, priority, 'Choose a valid task priority.', range));
          return;
        }
        updateDefaultTaskPriority.run(newPriority, project.id);
        redirect(response, projectLocation(project.id, filter, priority, range));
        return;
      }
    }
    const rangeMatch = /^\/projects\/(\d+)\/due-range$/.exec(url.pathname);
    if (request.method === 'POST' && rangeMatch) {
      const project = findProject.get(rangeMatch[1]);
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
        if (!validDueDate(from) || !validDueDate(through)) {
          error = 'Due range must use valid YYYY-MM-DD dates';
        } else if (from && through && from > through) {
          error = 'Due from must not be after Due through';
        }
        if (error) {
          sendHtml(response, 422, projectPage(project, filter, priority, error, previousRange));
        } else {
          redirect(response, projectLocation(project.id, filter, priority, { from, through }));
        }
        return;
      }
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch) {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const project = findProject.get(renameMatch[1]);
      if (project) {
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const range = dueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Restore this project before renaming it.', range));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 422, projectPage(project, filter, priority, 'Project name is required', range));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, priority, range));
        return;
      }
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const result = updateProjectArchive.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const projectMatch = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')), '', dueRange(url.searchParams)));
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+)\/(completion|rename|priority|due-date|move))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(response, 403, page('Archived project', '<h1>Archived project</h1><p>Restore this project before changing its tasks.</p>'));
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
        if (taskMatch[2]) {
          const isRename = taskMatch[3] === 'rename';
          const title = (form.get('title') || '').trim();
          if (isRename && !title) {
            sendHtml(response, 422, projectPage(project, filter, priority, 'Task title is required', range));
            return;
          }
          let result;
          if (taskMatch[3] === 'move') {
            const destination = findProject.get(form.get('destinationProject') || '');
            if (!destination || destination.archived || destination.id === project.id) {
              sendHtml(response, 422, projectPage(project, filter, priority, 'Choose an active destination project.', range));
              return;
            }
            result = moveTask(destination.id, taskMatch[2], project.id);
          } else if (isRename) {
            result = renameTask.run(title, taskMatch[2], project.id);
          } else if (taskMatch[3] === 'priority') {
            const newPriority = form.get('priority');
            if (!taskPriorities.includes(newPriority)) {
              sendHtml(response, 422, projectPage(project, filter, priority, 'Choose a valid task priority.', range));
              return;
            }
            result = updateTaskPriority.run(newPriority, taskMatch[2], project.id);
          } else if (taskMatch[3] === 'due-date') {
            const dueDate = (form.get('dueDate') || '').trim();
            if (!validDueDate(dueDate)) {
              sendHtml(response, 422, projectPage(project, filter, priority, 'Due date must be a valid YYYY-MM-DD date', range));
              return;
            }
            result = updateTaskDueDate.run(dueDate, taskMatch[2], project.id);
          } else {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, priority, 'Task title is required', range));
            return;
          }
          createTask(project.id, title, project.default_task_priority);
        }
        redirect(response, projectLocation(project.id, filter, priority, range));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    } else {
      response.end();
    }
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
