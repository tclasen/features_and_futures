import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET position = id');
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
const addTaskWithPriority = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE project_id = ?), 1))');
const moveTask = database.prepare(`UPDATE tasks SET project_id = ?, position =
  COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE project_id = ?), 1)
  WHERE id = ? AND project_id = ?`);

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1e293b; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
    main { background: white; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 28px #1e293b0a; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; gap: 12px; margin-bottom: 24px; }
    label { display: block; margin-bottom: 7px; font-weight: 600; }
    .field { flex: 1; }
    input { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
    button { min-height: 42px; padding: 9px 16px; border: 0; border-radius: 6px; background: #2563eb; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .rows { display: grid; gap: 10px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .project-info { display: grid; gap: 4px; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .task-row input { width: 20px; min-height: 20px; }
    .task-row input[type="text"] { width: 160px; }
    .task-title { overflow-wrap: anywhere; }
    .project-name { overflow-wrap: anywhere; }
    .error { color: #b91c1c; margin: -12px 0 18px; }
    [hidden] { display: none !important; }
    @media (max-width: 520px) { body { padding: 20px 12px; } main { padding: 22px 16px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const escapePath = (id) => '/projects/' + encodeURIComponent(id);

    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    async function projectsPage() {
      app.replaceChildren();
      app.append(element('h1', 'Workboard'));
      const filterLabel = element('label', 'Project filter'); filterLabel.htmlFor = 'project-filter';
      const filter = document.createElement('select'); filter.id = 'project-filter';
      for (const value of ['Active', 'Archived']) { const option = element('option', value); option.value = value; filter.append(option); }
      app.append(filterLabel, filter);
      const form = document.createElement('form');
      const field = element('div', undefined, 'field');
      const label = element('label', 'Project name');
      label.htmlFor = 'project-name';
      const input = document.createElement('input');
      input.id = 'project-name';
      input.name = 'projectName';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = element('button', 'Create project');
      create.type = 'submit';
      form.append(field, create);
      const error = element('p', 'Project name is required', 'error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      app.append(form, error);
      const rows = element('div', undefined, 'rows');
      rows.setAttribute('aria-label', 'Projects');
      app.append(rows);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) { error.hidden = false; input.focus(); return; }
        error.hidden = true;
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (response.ok) { input.value = ''; await loadRows(rows, filter); }
      });
      filter.addEventListener('change', () => loadRows(rows, filter));
      await loadRows(rows, filter);
    }

    const projectRowElements = new WeakMap();
    const projectRowRequests = new WeakMap();

    async function loadRows(rows, filterSelect) {
      const filter = filterSelect.value;
      const requestId = (projectRowRequests.get(rows) || 0) + 1;
      projectRowRequests.set(rows, requestId);
      const response = await fetch('/api/projects?filter=' + filter.toLowerCase());
      const projects = await response.json();
      if (projectRowRequests.get(rows) !== requestId || filterSelect.value !== filter) return;
      let rowElements = projectRowElements.get(rows);
      if (!rowElements) {
        rowElements = new Map();
        projectRowElements.set(rows, rowElements);
      }
      const visibleIds = new Set(projects.map(project => String(project.id)));
      for (const [id, row] of rowElements) {
        if (!visibleIds.has(id)) {
          row.remove();
          rowElements.delete(id);
        }
      }
      for (const project of projects) {
        const id = String(project.id);
        let row = rowElements.get(id);
        const isNew = !row;
        if (!row) {
          row = element('div', undefined, 'project-row');
          row.dataset.testid = 'project-row';
          const info = element('div', undefined, 'project-info');
          const name = element('span', undefined, 'project-name');
          const summary = element('span'); summary.dataset.testid = 'project-summary';
          info.append(name, summary);
          const actions = element('div', undefined, 'project-actions');
          const open = element('button', 'Open project');
          open.type = 'button';
          open.addEventListener('click', () => { location.href = escapePath(id); });
          const change = element('button');
          change.type = 'button';
          actions.append(open, change);
          row.append(info, actions);
          rowElements.set(id, row);
        }
        row.querySelector('.project-name').textContent = project.name;
        row.querySelector('[data-testid="project-summary"]').textContent = project.completed_count + '/' + project.total_count + ' completed';
        const change = row.querySelector('.project-actions button:last-child');
        change.textContent = filter === 'Archived' ? 'Restore project' : 'Archive project';
        change.onclick = async () => {
          await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: filter !== 'Archived' })
          });
          await loadRows(rows, filterSelect);
        };
        if (isNew) rows.append(row);
      }
    }

    async function projectPage(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { history.replaceState(null, '', '/'); await render(); return; }
      const project = await response.json();
      app.replaceChildren();
      const back = element('button', 'Projects');
      back.type = 'button';
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(back, element('h1', project.name));
      if (project.archived) app.append(element('p', 'Archived project'));
      const renameForm = document.createElement('form');
      const renameField = element('div', undefined, 'field');
      const renameLabel = element('label', 'New project name');
      renameLabel.htmlFor = 'new-project-name';
      const renameInput = document.createElement('input');
      renameInput.id = 'new-project-name'; renameInput.type = 'text'; renameInput.value = project.name;
      renameInput.disabled = Boolean(project.archived);
      renameField.append(renameLabel, renameInput);
      const renameButton = element('button', 'Rename project');
      renameButton.type = 'submit'; renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameField, renameButton);
      const renameError = element('p', 'Project name is required', 'error');
      renameError.setAttribute('role', 'alert'); renameError.hidden = true;
      app.append(renameForm, renameError);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = renameInput.value.trim();
        if (!name) { renameError.hidden = false; renameInput.focus(); return; }
        renameError.hidden = true;
        const result = await fetch('/api/projects/' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (result.ok) { renameInput.value = name; app.querySelector('h1').textContent = name; }
      });
      const defaultPriorityLabel = element('label', 'Default task priority');
      defaultPriorityLabel.htmlFor = 'default-task-priority';
      const defaultPriority = document.createElement('select');
      defaultPriority.id = 'default-task-priority';
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value); option.value = value; defaultPriority.append(option);
      }
      defaultPriority.value = project.default_task_priority || 'Normal';
      defaultPriority.disabled = Boolean(project.archived);
      defaultPriority.addEventListener('change', async () => {
        await fetch('/api/projects/' + encodeURIComponent(id) + '/default-priority', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: defaultPriority.value })
        });
      });
      app.append(defaultPriorityLabel, defaultPriority);
      const form = document.createElement('form');
      const field = element('div', undefined, 'field');
      const label = element('label', 'Task title');
      label.htmlFor = 'task-title';
      const input = document.createElement('input');
      input.id = 'task-title'; input.name = 'taskTitle'; input.type = 'text'; input.autocomplete = 'off';
      field.append(label, input);
      const create = element('button', 'Create task'); create.type = 'submit';
      create.disabled = Boolean(project.archived);
      form.append(field, create);
      const error = element('p', 'Task title is required', 'error');
      error.setAttribute('role', 'alert'); error.hidden = true;
      const filterLabel = element('label', 'Task filter'); filterLabel.htmlFor = 'task-filter';
      const filter = document.createElement('select'); filter.id = 'task-filter';
      for (const value of ['All', 'Open', 'Completed']) {
        const option = element('option', value); option.value = value; filter.append(option);
      }
      const priorityFilterLabel = element('label', 'Priority filter');
      priorityFilterLabel.htmlFor = 'priority-filter';
      const priorityFilter = document.createElement('select'); priorityFilter.id = 'priority-filter';
      for (const value of ['All', 'Low', 'Normal', 'High']) {
        const option = element('option', value); option.value = value; priorityFilter.append(option);
      }
      const dueFromLabel = element('label', 'Due from'); dueFromLabel.htmlFor = 'due-from';
      const dueFrom = document.createElement('input'); dueFrom.id = 'due-from'; dueFrom.type = 'text';
      const dueThroughLabel = element('label', 'Due through'); dueThroughLabel.htmlFor = 'due-through';
      const dueThrough = document.createElement('input'); dueThrough.id = 'due-through'; dueThrough.type = 'text';
      const applyDueRange = element('button', 'Apply due range'); applyDueRange.type = 'button';
      const dueRangeError = element('p', 'Due range must use valid YYYY-MM-DD dates', 'error');
      dueRangeError.setAttribute('role', 'alert'); dueRangeError.hidden = true;
      const dueOrderError = element('p', 'Due from must not be after Due through', 'error');
      dueOrderError.setAttribute('role', 'alert'); dueOrderError.hidden = true;
      let appliedDueFrom = '';
      let appliedDueThrough = '';
      const rows = element('div', undefined, 'rows');
      rows.setAttribute('aria-label', 'Tasks');
      app.append(form, error, filterLabel, filter, priorityFilterLabel, priorityFilter,
        dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, dueRangeError, dueOrderError, rows);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { error.hidden = false; input.focus(); return; }
        error.hidden = true;
        const result = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (result.ok) { input.value = ''; await loadTasks(id, rows, filter.value, priorityFilter.value, appliedDueFrom, appliedDueThrough); }
      });
      filter.addEventListener('change', () => loadTasks(id, rows, filter.value, priorityFilter.value, appliedDueFrom, appliedDueThrough));
      priorityFilter.addEventListener('change', () => loadTasks(id, rows, filter.value, priorityFilter.value, appliedDueFrom, appliedDueThrough));
      applyDueRange.addEventListener('click', async () => {
        const from = dueFrom.value.trim();
        const through = dueThrough.value.trim();
        dueRangeError.hidden = true; dueOrderError.hidden = true;
        if ((from && !isValidDate(from)) || (through && !isValidDate(through))) { dueRangeError.hidden = false; return; }
        if (from && through && from > through) { dueOrderError.hidden = false; return; }
        appliedDueFrom = from; appliedDueThrough = through;
        dueFrom.value = from; dueThrough.value = through;
        await loadTasks(id, rows, filter.value, priorityFilter.value, appliedDueFrom, appliedDueThrough);
      });
      await loadTasks(id, rows, filter.value, priorityFilter.value, appliedDueFrom, appliedDueThrough);
    }

    function isValidDate(value) {
      const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
      if (!match) return false;
      const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
      const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
    }

    async function loadTasks(projectId, rows, filter, priorityFilter, dueFrom = '', dueThrough = '') {
      const response = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks');
      const tasks = await response.json();
      const projectResponse = await fetch('/api/projects/' + encodeURIComponent(projectId));
      const project = await projectResponse.json();
      const destinationsResponse = await fetch('/api/projects?filter=active');
      const destinations = (await destinationsResponse.json()).filter(item => String(item.id) !== String(projectId));
      rows.replaceChildren();
      for (const task of tasks) {
        if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
        if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
        if ((dueFrom || dueThrough) && !task.due_date) continue;
        if (dueFrom && task.due_date < dueFrom || dueThrough && task.due_date > dueThrough) continue;
        const row = element('div', undefined, 'task-row'); row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed);
        checkbox.disabled = Boolean(project.archived);
        checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => {
          await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
          });
          await loadTasks(projectId, rows, filter, priorityFilter, dueFrom, dueThrough);
        });
        const title = element('span', task.title, 'task-title');
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.value = task.title;
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.disabled = Boolean(project.archived);
        const renameButton = element('button', 'Rename task');
        renameButton.type = 'button';
        renameButton.disabled = Boolean(project.archived);
        renameButton.addEventListener('click', async () => {
          const newTitle = renameInput.value.trim();
          if (!newTitle) {
            let error = row.querySelector('[role="alert"]');
            if (!error) { error = element('span', 'Task title is required', 'error'); error.setAttribute('role', 'alert'); row.append(error); }
            return;
          }
          const result = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle })
          });
          if (result.ok) await loadTasks(projectId, rows, filter, priorityFilter, dueFrom, dueThrough);
        });
        const priority = document.createElement('select');
        priority.setAttribute('aria-label', 'Task priority');
        for (const value of ['Low', 'Normal', 'High']) {
          const option = element('option', value); option.value = value; priority.append(option);
        }
        priority.value = task.priority;
        priority.disabled = Boolean(project.archived);
        priority.addEventListener('change', async () => {
          await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value })
          });
          await loadTasks(projectId, rows, filter, priorityFilter, dueFrom, dueThrough);
        });
        const dueDate = document.createElement('input');
        dueDate.type = 'text';
        dueDate.value = task.due_date || '';
        dueDate.setAttribute('aria-label', 'Task due date');
        dueDate.disabled = Boolean(project.archived);
        const saveDueDate = element('button', 'Save due date');
        saveDueDate.type = 'button';
        saveDueDate.disabled = Boolean(project.archived);
        saveDueDate.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: dueDate.value })
          });
          if (result.ok) {
            const saved = await result.json();
            dueDate.value = saved.due_date || '';
            const error = row.querySelector('[role="alert"]'); if (error) error.remove();
            await loadTasks(projectId, rows, filter, priorityFilter, dueFrom, dueThrough);
          } else {
            let error = row.querySelector('[role="alert"]');
            if (!error) { error = element('span', 'Due date must be a valid YYYY-MM-DD date', 'error'); error.setAttribute('role', 'alert'); row.append(error); }
          }
        });
        const destination = document.createElement('select');
        destination.setAttribute('aria-label', 'Destination project');
        for (const item of destinations) {
          const option = element('option', item.name); option.value = String(item.id); destination.append(option);
        }
        const moveButton = element('button', 'Move task');
        moveButton.type = 'button';
        destination.disabled = Boolean(project.archived) || destinations.length === 0;
        moveButton.disabled = Boolean(project.archived) || destinations.length === 0;
        moveButton.addEventListener('click', async () => {
          if (!destination.value) return;
          const result = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id) + '/move', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination_project_id: destination.value })
          });
          if (result.ok) await loadTasks(projectId, rows, filter, priorityFilter, dueFrom, dueThrough);
        });
        row.append(checkbox, title, renameInput, renameButton, priority, dueDate, saveDueDate, destination, moveButton); rows.append(row);
      }
    }

    async function render() {
      const match = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);
      if (match) await projectPage(decodeURIComponent(match[1]));
      else await projectsPage();
    }
    render();
  </script>
</body>
</html>`;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return send(response, 200, JSON.stringify(listProjects.all(url.searchParams.get('filter') === 'archived' ? 1 : 0)));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = addProject.run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (request.method === 'GET') {
      return send(response, 200, JSON.stringify(listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
    }
    if (request.method === 'POST') {
      if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived project' }));
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return send(response, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = addTaskWithPriority.run(projectId, title, project.default_task_priority || 'Normal', projectId);
      return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    }
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (request.method === 'POST' && moveMatch) {
    const sourceId = Number(moveMatch[1]);
    const source = getProject.get(sourceId);
    if (!source) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (source.archived) return send(response, 409, JSON.stringify({ error: 'Archived project' }));
    const body = await readJson(request);
    const destinationId = Number(body?.destination_project_id);
    const destination = getProject.get(destinationId);
    if (!destination || destination.archived || destinationId === sourceId) {
      return send(response, 400, JSON.stringify({ error: 'Active destination project is required' }));
    }
    const result = moveTask.run(destinationId, destinationId, moveMatch[2], sourceId);
    return result.changes ? send(response, 200, JSON.stringify({ status: 'ok' })) : send(response, 404, JSON.stringify({ error: 'Task not found' }));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') return send(response, 400, JSON.stringify({ error: 'Archive state is required' }));
    const result = setProjectArchived.run(body.archived ? 1 : 0, projectId);
    return result.changes ? send(response, 200, JSON.stringify({ status: 'ok' })) : send(response, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    const projectId = Number(defaultPriorityMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived project' }));
    const body = await readJson(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return send(response, 400, JSON.stringify({ error: 'Valid priority is required' }));
    updateProjectDefaultPriority.run(body.priority, projectId);
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived project' }));
    const body = await readJson(request);
    let result;
    if (Object.hasOwn(body || {}, 'due_date')) {
      const rawDate = typeof body.due_date === 'string' ? body.due_date.trim() : null;
      if (rawDate === null) return send(response, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
      if (rawDate !== '') {
        const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return send(response, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
          return send(response, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        }
      }
      result = updateTaskDueDate.run(rawDate || null, taskMatch[2], projectId);
      if (result.changes) return send(response, 200, JSON.stringify({ status: 'ok', due_date: rawDate || null }));
    } else if (typeof body?.completed === 'boolean') {
      result = updateTask.run(body.completed ? 1 : 0, taskMatch[2], projectId);
    } else if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return send(response, 400, JSON.stringify({ error: 'Task title is required' }));
      result = renameTask.run(title, taskMatch[2], projectId);
    } else if (['Low', 'Normal', 'High'].includes(body?.priority)) {
      result = updateTaskPriority.run(body.priority, taskMatch[2], projectId);
    } else {
      return send(response, 400, JSON.stringify({ error: 'Task update is required' }));
    }
    return result.changes ? send(response, 200, JSON.stringify({ status: 'ok' })) : send(response, 404, JSON.stringify({ error: 'Task not found' }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = renameProject.run(name, projectId);
    return result.changes
      ? send(response, 200, JSON.stringify({ status: 'ok', name }))
      : send(response, 404, JSON.stringify({ error: 'Project not found or archived' }));
  }
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(projectMatch[1]);
    return project
      ? send(response, 200, JSON.stringify(project))
      : send(response, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(response, 200, page(), 'text/html; charset=utf-8');
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
