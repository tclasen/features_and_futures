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

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
        if (response.ok) { input.value = ''; await loadRows(rows, filter.value); }
      });
      filter.addEventListener('change', () => loadRows(rows, filter.value));
      await loadRows(rows, filter.value);
    }

    const projectRowElements = new WeakMap();
    const projectRowRequests = new WeakMap();

    async function loadRows(rows, filter = 'Active') {
      const requestId = (projectRowRequests.get(rows) || 0) + 1;
      projectRowRequests.set(rows, requestId);
      const response = await fetch('/api/projects?filter=' + filter.toLowerCase());
      const projects = await response.json();
      if (projectRowRequests.get(rows) !== requestId) return;
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
          await loadRows(rows, filter);
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
      const rows = element('div', undefined, 'rows');
      rows.setAttribute('aria-label', 'Tasks');
      app.append(form, error, filterLabel, filter, rows);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { error.hidden = false; input.focus(); return; }
        error.hidden = true;
        const result = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (result.ok) { input.value = ''; await loadTasks(id, rows, filter.value); }
      });
      filter.addEventListener('change', () => loadTasks(id, rows, filter.value));
      await loadTasks(id, rows, filter.value);
    }

    async function loadTasks(projectId, rows, filter) {
      const response = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks');
      const tasks = await response.json();
      const projectResponse = await fetch('/api/projects/' + encodeURIComponent(projectId));
      const project = await projectResponse.json();
      rows.replaceChildren();
      for (const task of tasks) {
        if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
        const row = element('div', undefined, 'task-row'); row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed);
        checkbox.disabled = Boolean(project.archived);
        checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => {
          await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(task.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
          });
          await loadTasks(projectId, rows, filter);
        });
        row.append(checkbox, element('span', task.title, 'task-title')); rows.append(row);
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
      const result = addTask.run(projectId, title);
      return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') return send(response, 400, JSON.stringify({ error: 'Archive state is required' }));
    const result = setProjectArchived.run(body.archived ? 1 : 0, projectId);
    return result.changes ? send(response, 200, JSON.stringify({ status: 'ok' })) : send(response, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') return send(response, 400, JSON.stringify({ error: 'Completion state is required' }));
    const result = updateTask.run(body.completed ? 1 : 0, taskMatch[2], projectId);
    return result.changes ? send(response, 200, JSON.stringify({ status: 'ok' })) : send(response, 404, JSON.stringify({ error: 'Task not found' }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
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
