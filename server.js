import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
// Existing tasks receive the same default priority as newly created tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Seed legacy order from IDs; thereafter order is independent of task identity.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
// Keep positions even while a task is away, so returning tasks reclaim their slots.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);
const rememberPosition = db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const updateTaskProject = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?`);

function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const findTaskOwner = db.prepare('SELECT project_id FROM tasks WHERE id = ?');
function moveTask(taskId, sourceId, destinationId) {
  return transaction(() => {
    if (findTaskOwner.get(taskId)?.project_id !== sourceId) return { changes: 0 };
    rememberPosition.run(taskId, destinationId, destinationId);
    return updateTaskProject.run(destinationId, taskId, destinationId, taskId, sourceId);
  });
}
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`);
const saveInitialPosition = db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks WHERE id = ?`);
function createTask(projectId, title, priority) {
  return transaction(() => {
    const result = insertTask.run(projectId, title, priority, projectId);
    saveInitialPosition.run(result.lastInsertRowid);
    return result;
  });
}
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
// Upgrade databases created before archive support without changing existing IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const listProjects = db.prepare(`SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function matchesSearch(value, query) {
  const normalize = text => text.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, char => char.toLowerCase());
  return normalize(value).includes(normalize(query.trim()));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
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
    body { margin: 0; background: #f3f5f8; color: #182435; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    form { margin-bottom: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { padding: 10px; font: inherit; width: 100%; border: 1px solid #8994a4; border-radius: 6px; margin-bottom: 12px; }
    button { font: inherit; cursor: pointer; padding: 10px 16px; border: 0; border-radius: 6px; background: #245ac7; color: white; }
    select { font: inherit; padding: 8px; margin-bottom: 16px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid #dce1e8; overflow-wrap: anywhere; }
    .task-row[hidden] { display: none; }
    .task-row { flex-wrap: wrap; }
    .task-row input { width: auto; margin: 0; flex-shrink: 0; }
    .task-row form { margin: 0; width: 100%; }
    .task-row form input { max-width: 100%; margin-bottom: 12px; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #bd7600; outline-offset: 3px; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.6; }
    .project-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce1e8; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { margin: 0; flex-shrink: 0; }
    [role=alert] { color: #a51c22; margin-bottom: 16px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', name = '', filter = 'Active', query = '') {
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      <button type="submit">Create project</button>
    </form>
    <form action="/" method="get">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        <option${filter === 'Active' ? ' selected' : ''}>Active</option>
        <option${filter === 'Archived' ? ' selected' : ''}>Archived</option>
      </select>
    </form>
    <form action="/" method="get">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="query" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search projects</button>
    </form>
    <section aria-label="Projects">${listProjects.all(filter === 'Archived' ? 1 : 0).filter(project => matchesSearch(project.name, query)).map(project => `
      <div class="project-row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
          <input type="hidden" name="query" value="${escapeHtml(query)}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}</section>`);
}

function projectPage(project, error = '') {
  const destinations = listProjects.all(0).filter(destination => destination.id !== project.id);
  const moveDisabled = project.archived || destinations.length === 0;
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <div role="alert" id="task-error">${escapeHtml(error)}</div>
    <form action="/projects/${project.id}/rename" method="post" id="project-rename">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <label for="default-task-priority">Default task priority</label>
    <select id="default-task-priority" data-default-url="/projects/${project.id}/default-priority" data-saved-priority="${project.default_priority}"${project.archived ? ' disabled' : ''}>
      ${['Low', 'Normal', 'High'].map(priority => `<option${priority === project.default_priority ? ' selected' : ''}>${priority}</option>`).join('')}
    </select>
    <form action="/projects/${project.id}/tasks" method="post" id="task-create">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option><option>Open</option><option>Completed</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option>All</option><option>Low</option><option>Normal</option><option>High</option>
    </select>
    <form id="task-search-form">
      <label for="task-search">Task search</label>
      <input id="task-search" type="text">
      <button type="submit">Search tasks</button>
    </form>
    <form id="due-range">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text">
      <button type="submit">Apply due range</button>
    </form>
    <section aria-label="Tasks">${listTasks.all(project.id).map(task => `
      <div class="task-row" data-testid="task-row">
        <input type="checkbox" aria-label="${escapeHtml(`Complete ${task.title}`)}"
          data-completion-url="/projects/${project.id}/tasks/${task.id}/completion"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
        <span>${escapeHtml(task.title)}</span>
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" data-priority-url="/projects/${project.id}/tasks/${task.id}/priority" data-saved-priority="${task.priority}"${project.archived ? ' disabled' : ''}>
          ${['Low', 'Normal', 'High'].map(priority => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
        </select>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post" data-task-rename>
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/due-date" method="post" data-task-due-date>
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="due_date" type="text" value="${escapeHtml(task.due_date)}" data-saved-date="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/move" method="post" data-task-move>
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination_id"${moveDisabled ? ' disabled' : ''}>
            ${destinations.map(destination => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
      </div>`).join('')}</section>
    <script>
      const filter = document.getElementById('task-filter');
      const priorityFilter = document.getElementById('priority-filter');
      const dueFrom = document.getElementById('due-from');
      const dueThrough = document.getElementById('due-through');
      let appliedFrom = '';
      let appliedThrough = '';
      let appliedQuery = '';
      ${matchesSearch.toString()}
      ${validDueDate.toString()}
      document.getElementById('task-search-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = document.getElementById('task-search');
        appliedQuery = input.value = input.value.trim();
        applyFilter();
      });
      document.getElementById('due-range').addEventListener('submit', event => {
        event.preventDefault();
        const from = dueFrom.value.trim();
        const through = dueThrough.value.trim();
        const alert = document.getElementById('task-error');
        if (!validDueDate(from) || !validDueDate(through)) {
          alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
          return;
        }
        if (from && through && from > through) {
          alert.textContent = 'Due from must not be after Due through';
          return;
        }
        alert.textContent = '';
        appliedFrom = dueFrom.value = from;
        appliedThrough = dueThrough.value = through;
        applyFilter();
      });
      function applyFilter() {
        document.querySelectorAll('[data-testid="task-row"]').forEach(row => {
          const completed = row.querySelector('[data-completion-url]').checked;
          const priority = row.querySelector('[data-priority-url]').value;
          const matchesCompletion = filter.value === 'All' || (filter.value === 'Completed' ? completed : !completed);
          const matchesPriority = priorityFilter.value === 'All' || priorityFilter.value === priority;
          const date = row.querySelector('[data-saved-date]').dataset.savedDate;
          const matchesDate = (!appliedFrom && !appliedThrough) ||
            (date && (!appliedFrom || date >= appliedFrom) && (!appliedThrough || date <= appliedThrough));
          const matchesTitle = matchesSearch(row.querySelector('span').textContent, appliedQuery);
          row.hidden = !matchesCompletion || !matchesPriority || !matchesDate || !matchesTitle;
        });
      }
      filter.addEventListener('change', applyFilter);
      priorityFilter.addEventListener('change', applyFilter);
      function bindTaskRows() {
      document.querySelectorAll('[data-task-move]').forEach(form => {
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const button = form.querySelector('button');
          const alert = document.getElementById('task-error');
          alert.textContent = '';
          button.disabled = true;
          try {
            const response = await fetch(form.action, {
              method: 'POST', body: new URLSearchParams({ destination_id: form.elements.destination_id.value })
            });
            if (!response.ok) throw new Error('Task move failed');
            form.closest('[data-testid="task-row"]').remove();
          } catch {
            alert.textContent = 'Could not move task. Please try again.';
            button.disabled = false;
          }
        });
      });
      document.querySelectorAll('[data-completion-url]').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
          const completed = checkbox.checked;
          checkbox.disabled = true;
          document.getElementById('task-error').textContent = '';
          try {
            const response = await fetch(checkbox.dataset.completionUrl, {
              method: 'POST', body: new URLSearchParams({ completed: String(completed) })
            });
            if (!response.ok) throw new Error('Completion update failed');
          } catch {
            checkbox.checked = !completed;
            document.getElementById('task-error').textContent = 'Could not save task completion. Please try again.';
          } finally {
            checkbox.disabled = false;
            applyFilter();
          }
        });
      });
      document.querySelectorAll('[data-task-rename]').forEach(form => {
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const input = form.elements.title;
          const title = input.value.trim();
          const alert = document.getElementById('task-error');
          alert.textContent = '';
          if (!title) {
            alert.textContent = 'Task title is required';
            return;
          }
          const button = form.querySelector('button');
          button.disabled = true;
          try {
            const response = await fetch(form.action, {
              method: 'POST', body: new URLSearchParams({ title })
            });
            if (!response.ok) throw new Error('Rename failed');
            const row = form.closest('[data-testid="task-row"]');
            row.querySelector('span').textContent = title;
            row.querySelector('[data-completion-url]').setAttribute('aria-label', 'Complete ' + title);
            input.value = title;
            applyFilter();
          } catch {
            alert.textContent = 'Could not rename task. Please try again.';
          } finally {
            button.disabled = false;
          }
        });
      });
      document.querySelectorAll('[data-priority-url]').forEach(select => {
        select.addEventListener('change', async () => {
          const priority = select.value;
          select.disabled = true;
          const alert = document.getElementById('task-error');
          alert.textContent = '';
          try {
            const response = await fetch(select.dataset.priorityUrl, {
              method: 'POST', body: new URLSearchParams({ priority })
            });
            if (!response.ok) throw new Error('Priority update failed');
            select.dataset.savedPriority = priority;
          } catch {
            select.value = select.dataset.savedPriority;
            alert.textContent = 'Could not save task priority. Please try again.';
          } finally {
            select.disabled = false;
            applyFilter();
          }
        });
      });
      document.querySelectorAll('[data-task-due-date]').forEach(form => {
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const input = form.elements.due_date;
          const dueDate = input.value.trim();
          const button = form.querySelector('button');
          const alert = document.getElementById('task-error');
          alert.textContent = '';
          button.disabled = true;
          try {
            const response = await fetch(form.action, {
              method: 'POST', body: new URLSearchParams({ due_date: dueDate })
            });
            if (response.status === 422) {
              alert.textContent = 'Due date must be a valid YYYY-MM-DD date';
              return;
            }
            if (!response.ok) throw new Error('Due date update failed');
            input.value = dueDate;
            input.dataset.savedDate = dueDate;
            applyFilter();
          } catch {
            alert.textContent = 'Could not save task due date. Please try again.';
          } finally {
            button.disabled = false;
          }
        });
      });
      }
      bindTaskRows();
      document.getElementById('task-create').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const alert = document.getElementById('task-error');
        const title = form.elements.title.value.trim();
        alert.textContent = '';
        if (!title) {
          alert.textContent = 'Task title is required';
          return;
        }
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams({ title }) });
          if (!response.ok) throw new Error('Task creation failed');
          const updated = new DOMParser().parseFromString(await response.text(), 'text/html');
          document.querySelector('section[aria-label="Tasks"]').replaceWith(updated.querySelector('section[aria-label="Tasks"]'));
          form.elements.title.value = '';
          bindTaskRows();
          applyFilter();
        } catch {
          alert.textContent = 'Could not create task. Please try again.';
        } finally {
          button.disabled = false;
        }
      });
      document.getElementById('project-rename').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = form.elements.name.value.trim();
        const alert = document.getElementById('task-error');
        alert.textContent = '';
        if (!name) {
          alert.textContent = 'Project name is required';
          return;
        }
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams({ name }) });
          if (!response.ok) throw new Error('Project rename failed');
          document.querySelector('h1').textContent = name;
          document.title = name + ' — Workboard';
          form.elements.name.value = name;
        } catch {
          alert.textContent = 'Could not rename project. Please try again.';
        } finally {
          button.disabled = false;
        }
      });
      const defaultPriority = document.getElementById('default-task-priority');
      defaultPriority.addEventListener('change', async () => {
        const priority = defaultPriority.value;
        defaultPriority.disabled = true;
        const alert = document.getElementById('task-error');
        alert.textContent = '';
        try {
          const response = await fetch(defaultPriority.dataset.defaultUrl, {
            method: 'POST', body: new URLSearchParams({ priority })
          });
          if (!response.ok) throw new Error('Default priority update failed');
          defaultPriority.dataset.savedPriority = priority;
        } catch {
          defaultPriority.value = defaultPriority.dataset.savedPriority;
          alert.textContent = 'Could not save default task priority. Please try again.';
        } finally {
          defaultPriority.disabled = false;
        }
      });
    </script>`);
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectsPage('', '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active', (url.searchParams.get('query') || '').trim()));
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      const filter = form.get('filter') === 'Archived' ? 'Archived' : 'Active';
      const query = (form.get('query') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required', '', filter, query));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: filter === 'Active' && !query ? '/' : '/?' + new URLSearchParams({ filter, query }) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const archived = parts[3] === 'archive';
      const query = ((await readForm(req)).get('query') || '').trim();
      const result = setArchived.run(archived ? 1 : 0, Number(parts[2]));
      if (!result.changes) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      res.writeHead(303, { Location: '/?' + new URLSearchParams({ filter: archived ? 'Active' : 'Archived', query }) });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, projectPage(project));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const project = findProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      if (project.archived) {
        html(res, 403, projectPage(project, 'Archived projects cannot be changed'));
        return;
      }
      const priority = (await readForm(req)).get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        html(res, 400, page('Invalid priority', '<h1>Invalid task priority</h1>'));
        return;
      }
      setDefaultPriority.run(priority, project.id);
      res.writeHead(204);
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const project = findProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      if (project.archived) {
        html(res, 403, projectPage(project, 'Archived projects cannot be changed'));
        return;
      }
      const name = ((await readForm(req)).get('name') || '').trim();
      if (!name) {
        html(res, 422, projectPage(project, 'Project name is required'));
        return;
      }
      renameProject.run(name, project.id);
      res.writeHead(303, { Location: `/projects/${project.id}` });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/(completion|rename|priority|due-date|move))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const project = findProject.get(Number(parts[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      if (project.archived) {
        html(res, 403, projectPage(project, 'Archived projects cannot be changed'));
        return;
      }
      const form = await readForm(req);
      if (parts.length === 4) {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, 'Task title is required'));
          return;
        }
        createTask(project.id, title, project.default_priority);
        res.writeHead(303, { Location: `/projects/${project.id}` });
        res.end();
      } else if (parts[5] === 'move') {
        const destinationId = form.get('destination_id') || '';
        const destination = /^\d+$/.test(destinationId) ? findProject.get(Number(destinationId)) : null;
        if (!destination || destination.id === project.id || destination.archived) {
          html(res, 422, projectPage(project, 'Destination must be another active project'));
          return;
        }
        const result = moveTask(Number(parts[4]), project.id, destination.id);
        res.writeHead(result.changes ? 204 : 404);
        res.end();
      } else if (parts[5] === 'due-date') {
        const dueDate = (form.get('due_date') || '').trim();
        if (!validDueDate(dueDate)) {
          html(res, 422, projectPage(project, 'Due date must be a valid YYYY-MM-DD date'));
          return;
        }
        const result = setTaskDueDate.run(dueDate, Number(parts[4]), project.id);
        res.writeHead(result.changes ? 204 : 404);
        res.end();
      } else if (parts[5] === 'priority') {
        const priority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          html(res, 400, page('Invalid priority', '<h1>Invalid task priority</h1>'));
          return;
        }
        const result = setTaskPriority.run(priority, Number(parts[4]), project.id);
        res.writeHead(result.changes ? 204 : 404);
        res.end();
      } else if (parts[5] === 'rename') {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, 'Task title is required'));
          return;
        }
        const result = renameTask.run(title, Number(parts[4]), project.id);
        if (!result.changes) {
          html(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        res.writeHead(303, { Location: `/projects/${project.id}` });
        res.end();
      } else {
        const completed = form.get('completed');
        if (completed !== 'true' && completed !== 'false') {
          html(res, 400, page('Invalid completion', '<h1>Invalid completion state</h1>'));
          return;
        }
        const result = updateTask.run(completed === 'true' ? 1 : 0, Number(parts[4]), project.id);
        res.writeHead(result.changes ? 204 : 404);
        res.end();
      }
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
    } else {
      console.error(error);
      html(res, 500, page('Server error', '<h1>Server error</h1>'));
    }
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
