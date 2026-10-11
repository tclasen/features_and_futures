import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount
  FROM projects p ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare("INSERT INTO tasks (project_id, title, priority) SELECT id, ?, default_priority FROM projects WHERE id = ? AND archived = 0");
const updateProjectDefaultPriority = database.prepare("UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0");
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?
  AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);
const renameTask = database.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?
  AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);
const updateTaskPriority = database.prepare(`UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?
  AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);
const updateTaskDueDate = database.prepare(`UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?
  AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17202a; background: #f5f7fa; }
    body { max-width: 760px; margin: 3rem auto; padding: 0 1.25rem; }
    h1 { margin-bottom: 1.5rem; }
    form { display: flex; gap: .65rem; margin-bottom: 1.5rem; }
    input, button { font: inherit; padding: .65rem .8rem; border: 1px solid #aab4c0; border-radius: .35rem; }
    input { flex: 1; min-width: 0; }
    button { background: #fff; cursor: pointer; }
    button:hover { background: #eaf0f7; }
    [role="alert"] { color: #a32222; margin: 0 0 1rem; }
    .project-list { display: grid; gap: .65rem; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 1rem; background: #fff; border: 1px solid #d5dce5; border-radius: .4rem; }
    .project-name { overflow-wrap: anywhere; }
    .task-controls { display: grid; gap: .65rem; margin: 1.5rem 0; }
    .task-row { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; background: #fff; border: 1px solid #d5dce5; border-radius: .4rem; }
    .task-title { flex: 1; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; }
    .task-row input[type="text"] { flex: 1; min-width: 4rem; }
  </style>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script>
    const app = document.querySelector('#app');
    const projectMatch = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);

    function element(tag, text, attributes = {}) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      return node;
    }

    function canonicalDueDate(value) {
      const date = value.trim();
      if (!date) return '';
      const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date);
      if (!match) return null;
      const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
      if (year < 1 || month < 1 || month > 12) return null;
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day >= 1 && day <= monthDays[month - 1] ? date : null;
    }

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }

    async function showList() {
      app.replaceChildren();
      app.append(element('h1', 'Workboard'));
      const alert = element('p', '', { role: 'alert', hidden: '' });
      const form = element('form');
      const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', autocomplete: 'off' });
      const submit = element('button', 'Create project', { type: 'submit' });
      form.append(input, submit);
      const filter = element('select', undefined, { 'aria-label': 'Project filter' });
      for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
      const list = element('section', undefined, { class: 'project-list', 'aria-label': 'Projects' });
      app.append(alert, form, filter, list);
      let refreshSequence = 0;
      async function refresh() {
        const sequence = ++refreshSequence;
        const projects = await loadProjects();
        if (sequence !== refreshSequence) return;
        list.replaceChildren();
        for (const project of projects) {
          if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
          const row = element('div', undefined, { class: 'project-row', 'data-testid': 'project-row' });
          const name = element('span', project.name, { class: 'project-name' });
          const summary = element('span', project.completedCount + '/' + project.totalCount + ' completed', { 'data-testid': 'project-summary' });
          const open = element('button', 'Open project', { type: 'button' });
          open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
          const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
          archive.addEventListener('click', async () => {
            const result = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !Boolean(project.archived) }) });
            if (!result.ok) { alert.textContent = 'Could not update project'; alert.hidden = false; return; }
            await refresh();
          });
          row.append(name, summary, open, archive);
          list.append(row);
        }
      }
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        alert.hidden = true;
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!response.ok) {
          alert.textContent = 'Could not create project';
          alert.hidden = false;
          return;
        }
        input.value = '';
        await refresh();
      });
      filter.addEventListener('change', () => refresh().catch(showLoadError));
      await refresh();
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      app.replaceChildren();
      const back = element('button', 'Projects', { type: 'button' });
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(back);
      if (!response.ok) {
        app.append(element('h1', 'Project not found'));
        return;
      }
      const project = await response.json();
      app.append(element('h1', project.name));
      if (project.archived) app.append(element('p', 'Archived project'));
      const alert = element('p', '', { role: 'alert', hidden: '' });
      const defaultPriorityLabel = element('label', 'Default task priority');
      const defaultPriority = element('select', undefined, { 'aria-label': 'Default task priority' });
      for (const value of ['Low', 'Normal', 'High']) defaultPriority.append(element('option', value, { value }));
      defaultPriority.value = project.defaultPriority;
      defaultPriority.disabled = Boolean(project.archived);
      defaultPriorityLabel.append(defaultPriority);
      const renameForm = element('form');
      const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New project name', autocomplete: 'off' });
      const renameButton = element('button', 'Rename project', { type: 'submit' });
      if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
      renameForm.append(renameInput, renameButton);
      const form = element('form');
      const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', autocomplete: 'off' });
      const submit = element('button', 'Create task', { type: 'submit' });
      if (project.archived) { input.disabled = true; submit.disabled = true; }
      form.append(input, submit);
      const controls = element('div', undefined, { class: 'task-controls' });
      const filterLabel = element('label', 'Task filter');
      const filter = element('select', undefined, { 'aria-label': 'Task filter' });
      for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
      filterLabel.append(filter);
      const priorityFilterLabel = element('label', 'Priority filter');
      const priorityFilter = element('select', undefined, { 'aria-label': 'Priority filter' });
      for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', value, { value }));
      priorityFilterLabel.append(priorityFilter);
      const dueFrom = element('input', undefined, { type: 'text', 'aria-label': 'Due from', autocomplete: 'off' });
      const dueThrough = element('input', undefined, { type: 'text', 'aria-label': 'Due through', autocomplete: 'off' });
      const applyDueRange = element('button', 'Apply due range', { type: 'button' });
      let appliedDueRange = { from: '', through: '' };
      const list = element('section', undefined, { class: 'project-list', 'aria-label': 'Tasks' });
      app.append(alert, renameForm, defaultPriorityLabel, form, controls, list);
      controls.append(filterLabel, priorityFilterLabel, dueFrom, dueThrough, applyDueRange);
      let refreshSequence = 0;
      async function refresh() {
        const sequence = ++refreshSequence;
        const taskResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks');
        if (!taskResponse.ok) throw new Error('Could not load tasks');
        const tasks = await taskResponse.json();
        if (sequence !== refreshSequence) return;
        list.replaceChildren();
        for (const task of tasks) {
          if ((filter.value === 'Open' && task.completed) || (filter.value === 'Completed' && !task.completed)) continue;
          if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
          if ((appliedDueRange.from || appliedDueRange.through) && !task.dueDate) continue;
          if (appliedDueRange.from && task.dueDate < appliedDueRange.from) continue;
          if (appliedDueRange.through && task.dueDate > appliedDueRange.through) continue;
          const row = element('div', undefined, { class: 'task-row', 'data-testid': 'task-row' });
          const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': 'Complete ' + task.title });
          checkbox.checked = Boolean(task.completed);
          if (project.archived) checkbox.disabled = true;
          checkbox.addEventListener('change', async () => {
            const updateResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
            });
            if (!updateResponse.ok) {
              alert.textContent = 'Could not update task'; alert.hidden = false; checkbox.checked = !checkbox.checked; return;
            }
            alert.hidden = true;
            await refresh();
          });
          const title = element('span', task.title, { class: 'task-title' });
          const priority = element('select', undefined, { 'aria-label': 'Task priority' });
          for (const value of ['Low', 'Normal', 'High']) priority.append(element('option', value, { value }));
          priority.value = task.priority;
          if (project.archived) priority.disabled = true;
          priority.addEventListener('change', async () => {
            const priorityResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: priority.value })
            });
            if (!priorityResponse.ok) {
              alert.textContent = 'Could not update task priority'; alert.hidden = false; priority.value = task.priority; return;
            }
            alert.hidden = true;
            await refresh();
          });
          const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New task title', autocomplete: 'off' });
          const renameButton = element('button', 'Rename task', { type: 'button' });
          if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
          renameButton.addEventListener('click', async () => {
            const newTitle = renameInput.value.trim();
            if (!newTitle) { alert.textContent = 'Task title is required'; alert.hidden = false; renameInput.focus(); return; }
            alert.hidden = true;
            const renameResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: newTitle })
            });
            if (!renameResponse.ok) { alert.textContent = 'Could not rename task'; alert.hidden = false; return; }
            await refresh();
          });
          const dueDateInput = element('input', undefined, { type: 'text', 'aria-label': 'Task due date', autocomplete: 'off' });
          dueDateInput.value = task.dueDate || '';
          const saveDueDate = element('button', 'Save due date', { type: 'button' });
          if (project.archived) { dueDateInput.disabled = true; saveDueDate.disabled = true; }
          saveDueDate.addEventListener('click', async () => {
            const dueDate = canonicalDueDate(dueDateInput.value);
            if (dueDate === null) { alert.textContent = 'Due date must be a valid YYYY-MM-DD date'; alert.hidden = false; dueDateInput.focus(); return; }
            const dateResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dueDate })
            });
            if (!dateResponse.ok) { alert.textContent = 'Could not save due date'; alert.hidden = false; return; }
            alert.hidden = true;
            await refresh();
          });
          row.append(checkbox, title, priority, renameInput, renameButton, dueDateInput, saveDueDate);
          list.append(row);
        }
      }
      filter.addEventListener('change', () => refresh().catch(showLoadError));
      priorityFilter.addEventListener('change', () => refresh().catch(showLoadError));
      applyDueRange.addEventListener('click', async () => {
        const fromValue = dueFrom.value.trim();
        const throughValue = dueThrough.value.trim();
        const from = fromValue ? canonicalDueDate(fromValue) : '';
        const through = throughValue ? canonicalDueDate(throughValue) : '';
        if (from === null || through === null) {
          alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
          alert.hidden = false;
          return;
        }
        if (from && through && from > through) {
          alert.textContent = 'Due from must not be after Due through';
          alert.hidden = false;
          return;
        }
        appliedDueRange = { from, through };
        dueFrom.value = from;
        dueThrough.value = through;
        alert.hidden = true;
        await refresh();
      });
      defaultPriority.addEventListener('change', async () => {
        const value = defaultPriority.value;
        const result = await fetch('/api/projects/' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ defaultPriority: value })
        });
        if (!result.ok) {
          alert.textContent = 'Could not update default task priority'; alert.hidden = false;
          defaultPriority.value = project.defaultPriority;
          return;
        }
        project.defaultPriority = value;
        alert.hidden = true;
      });
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        const name = renameInput.value.trim();
        if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; renameInput.focus(); return; }
        alert.hidden = true;
        const renameResponse = await fetch('/api/projects/' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (!renameResponse.ok) { alert.textContent = 'Could not rename project'; alert.hidden = false; return; }
        const renamedProject = await renameResponse.json();
        app.querySelector('h1').textContent = renamedProject.name;
        renameInput.value = '';
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
        alert.hidden = true;
        const createResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (!createResponse.ok) { alert.textContent = 'Could not create task'; alert.hidden = false; return; }
        input.value = '';
        await refresh();
      });
      await refresh();
    }

    function showLoadError() {
      app.replaceChildren(element('p', 'Unable to load Workboard. Please refresh the page.', { role: 'alert' }));
    }

    (projectMatch ? showProject(projectMatch[1]) : showList()).catch(() => {
      app.replaceChildren(element('p', 'Unable to load Workboard. Please refresh the page.', { role: 'alert' }));
    });
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function normalizeDueDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? date : null;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = createProject.run(name);
    sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') { sendJson(response, 400, { error: 'Archived must be a boolean' }); return; }
    const result = setProjectArchived.run(body.archived ? 1 : 0, projectId);
    if (!result.changes) { sendJson(response, 404, { error: 'Project not found' }); return; }
    sendJson(response, 200, getProject.get(projectId));
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const body = await readJson(request);
    if (typeof body?.defaultPriority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.defaultPriority)) { sendJson(response, 400, { error: 'Invalid default task priority' }); return; }
      const result = updateProjectDefaultPriority.run(body.defaultPriority, projectId);
      if (!result.changes) {
        const project = getProject.get(projectId);
        sendJson(response, project ? 409 : 404, { error: project ? 'Archived projects cannot change defaults' : 'Project not found' });
        return;
      }
      sendJson(response, 200, getProject.get(projectId));
      return;
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
    const result = renameProject.run(name, projectId);
    if (!result.changes) {
      const project = getProject.get(projectId);
      sendJson(response, project ? 409 : 404, { error: project ? 'Archived projects cannot be renamed' : 'Project not found' });
      return;
    }
    sendJson(response, 200, getProject.get(projectId));
    return;
  }
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollectionMatch && ['GET', 'POST'].includes(request.method)) {
    const projectId = Number(taskCollectionMatch[1]);
    if (!getProject.get(projectId)) { sendJson(response, 404, { error: 'Project not found' }); return; }
    if (request.method === 'GET') { sendJson(response, 200, listTasks.all(projectId)); return; }
    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
    const result = createTask.run(title, projectId);
    if (!result.changes) { sendJson(response, 409, { error: 'Archived projects cannot create tasks' }); return; }
    sendJson(response, 201, getTask.get(Number(result.lastInsertRowid), projectId));
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    if (Object.hasOwn(body || {}, 'dueDate')) {
      const dueDate = normalizeDueDate(body.dueDate);
      if (dueDate === null) { sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' }); return; }
      const result = updateTaskDueDate.run(dueDate || null, taskId, projectId, projectId);
      if (!result.changes) {
        const project = getProject.get(projectId);
        const task = getTask.get(taskId, projectId);
        sendJson(response, !project || !task ? 404 : 409, { error: !project || !task ? 'Task not found' : 'Archived projects cannot update task due dates' });
        return;
      }
      sendJson(response, 200, getTask.get(taskId, projectId));
      return;
    }
    if (typeof body?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(body.priority)) { sendJson(response, 400, { error: 'Invalid task priority' }); return; }
      const result = updateTaskPriority.run(body.priority, taskId, projectId, projectId);
      if (!result.changes) {
        const project = getProject.get(projectId);
        const task = getTask.get(taskId, projectId);
        sendJson(response, !project || !task ? 404 : 409, { error: !project || !task ? 'Task not found' : 'Archived projects cannot update task priority' });
        return;
      }
      sendJson(response, 200, getTask.get(taskId, projectId));
      return;
    }
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const result = renameTask.run(title, taskId, projectId, projectId);
      if (!result.changes) {
        const project = getProject.get(projectId);
        const task = getTask.get(taskId, projectId);
        sendJson(response, !project || !task ? 404 : 409, { error: !project || !task ? 'Task not found' : 'Archived projects cannot rename tasks' });
        return;
      }
      sendJson(response, 200, getTask.get(taskId, projectId));
      return;
    }
    if (typeof body?.completed !== 'boolean') { sendJson(response, 400, { error: 'Completed must be a boolean' }); return; }
    const result = updateTask.run(body.completed ? 1 : 0, taskId, projectId, projectId);
    if (!result.changes) {
      const project = getProject.get(projectId);
      const task = getTask.get(taskId, projectId);
      sendJson(response, !project || !task ? 404 : 409, { error: !project || !task ? 'Task not found' : 'Archived projects cannot update tasks' });
      return;
    }
    sendJson(response, 200, getTask.get(taskId, projectId));
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
