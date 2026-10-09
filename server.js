import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = resolve(process.env.DB_PATH ?? './workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

// Upgrade databases created by the Task 001/002 checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { margin: 0 0 1.5rem; font-size: 2rem; }
    form, .project-row { display: flex; gap: .75rem; align-items: center; }
    form { margin-bottom: 1.5rem; }
    input { flex: 1; min-width: 0; padding: .65rem .75rem; border: 1px solid #aab4c0; border-radius: 6px; font: inherit; }
    button { padding: .65rem .9rem; border: 0; border-radius: 6px; background: #2459a6; color: white; font: inherit; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #8ab4f8; outline-offset: 2px; }
    .project-row { justify-content: space-between; padding: .9rem 1rem; margin: .5rem 0; background: white; border: 1px solid #d9e0e8; border-radius: 8px; }
    .project-info { display: flex; align-items: center; gap: 1rem; }
    .project-actions { display: flex; gap: .5rem; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .alert { color: #a32626; margin: .25rem 0 1rem; }
    .back { margin-bottom: 1rem; }
    .task-row { display: flex; align-items: center; gap: .65rem; padding: .65rem .9rem; margin: .5rem 0; background: white; border: 1px solid #d9e0e8; border-radius: 8px; }
    .task-row input { flex: 0 0 auto; width: 1.1rem; height: 1.1rem; }
    .task-row label { flex: 1; }
    .filter { display: flex; align-items: center; gap: .5rem; margin-bottom: 1rem; }
    @media (max-width: 520px) { form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script>
    const app = document.querySelector('#app');
    const projectPath = window.location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);

    function element(tag, text, attributes = {}) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    }

    async function loadProjects(archived = false) {
      const response = await fetch('/api/projects?archived=' + archived);
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }

    async function showList() {
      app.replaceChildren(element('h1', 'Workboard'));
      const filterLabel = element('label', 'Project filter', { for: 'project-filter' });
      const filter = element('select', undefined, { id: 'project-filter' });
      for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
      const filterRow = element('div', undefined, { class: 'filter' });
      filterRow.append(filterLabel, filter);
      const form = element('form');
      const label = element('label', 'Project name', { for: 'project-name' });
      const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
      const submit = element('button', 'Create project', { type: 'submit' });
      form.append(label, input, submit);
      const alert = element('p', undefined, { class: 'alert', role: 'alert', hidden: '' });
      const list = element('section', undefined, { 'aria-label': 'Projects' });
      app.append(filterRow, form, alert, list);

      async function refresh() {
        list.replaceChildren();
        for (const project of await loadProjects(filter.value === 'Archived')) {
          const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
          const info = element('div', undefined, { class: 'project-info' });
          info.append(element('span', project.name));
          info.append(element('span', project.completed + '/' + project.total + ' completed', { 'data-testid': 'project-summary' }));
          row.append(info);
          const open = element('button', 'Open project', { type: 'button' });
          open.addEventListener('click', () => { window.location.href = '/projects/' + encodeURIComponent(project.id); });
          const action = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
          action.addEventListener('click', async () => {
            const result = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
            if (result.ok) await refresh();
          });
          const actions = element('div', undefined, { class: 'project-actions' });
          actions.append(open, action);
          row.append(actions);
          list.append(row);
        }
      }
      filter.addEventListener('change', refresh);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        alert.hidden = true;
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (response.ok) {
          input.value = '';
          await refresh();
        }
      });
      await refresh();
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) {
        app.replaceChildren(element('h1', 'Project not found'));
        return;
      }
      const project = await response.json();
      const back = element('button', 'Projects', { type: 'button', class: 'back' });
      back.addEventListener('click', () => { window.location.href = '/'; });
      app.append(back, element('h1', project.name));
      if (project.archived) app.append(element('p', 'Archived project'));

      const form = element('form');
      const label = element('label', 'Task title', { for: 'task-title' });
      const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
      form.append(label, input, element('button', 'Create task', { type: 'submit' }));
      if (project.archived) {
        input.disabled = true;
        form.querySelector('button').disabled = true;
      }
      const alert = element('p', undefined, { class: 'alert', role: 'alert', hidden: '' });
      const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
      const filter = element('select', undefined, { id: 'task-filter' });
      for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
      const filterRow = element('div', undefined, { class: 'filter' });
      filterRow.append(filterLabel, filter);
      const list = element('section', undefined, { 'aria-label': 'Tasks' });
      app.append(form, alert, filterRow, list);

      async function refresh() {
        const taskResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks');
        if (!taskResponse.ok) throw new Error('Could not load tasks');
        const tasks = await taskResponse.json();
        list.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = element('div', undefined, { 'data-testid': 'task-row', class: 'task-row' });
          const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': 'Complete ' + task.title });
          checkbox.checked = task.completed;
          checkbox.disabled = project.archived;
          checkbox.addEventListener('change', async () => {
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked })
            });
            if (update.ok) await refresh();
          });
          row.append(checkbox, element('span', task.title));
          list.append(row);
        }
      }
      filter.addEventListener('change', refresh);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) {
          alert.textContent = 'Task title is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        alert.hidden = true;
        const create = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (create.ok) {
          input.value = '';
          await refresh();
        }
      });
      await refresh();
    }

    (projectPath ? showProject(decodeURIComponent(projectPath[1])) : showList())
      .catch(() => { app.replaceChildren(element('p', 'Unable to load Workboard. Please refresh the page.')); });
  </script>
</body>
</html>`;

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('archived') === 'true';
    const projects = database.prepare(`
      SELECT p.id, p.name, p.archived,
        COUNT(t.id) AS total,
        COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) AS completed
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid
    `).all(archived ? 1 : 0).map(project => ({ ...project, archived: Boolean(project.archived) }));
    sendJson(response, 200, projects);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const project = { id: randomUUID(), name };
      database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, name, Date.now());
      sendJson(response, 201, project);
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
    }
    return;
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const body = await readJson(request);
      if (typeof body.archived !== 'boolean') { sendJson(response, 400, { error: 'Archive state must be a boolean' }); return; }
      const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, archiveMatch[1]);
      if (!result.changes) { sendJson(response, 404, { error: 'Project not found' }); return; }
      sendJson(response, 200, { id: archiveMatch[1], archived: body.archived });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    let id;
    try { id = decodeURIComponent(projectMatch[1]); } catch {
      sendJson(response, 400, { error: 'Invalid project ID' });
      return;
    }
    const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(id);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }

  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(tasksMatch[1]);
    if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
    const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(project.id)
      .map(task => ({ ...task, completed: Boolean(task.completed) }));
    sendJson(response, 200, tasks);
    return;
  }

  if (tasksMatch && request.method === 'POST') {
    try {
      const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(tasksMatch[1]);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot receive tasks' }); return; }
      const body = await readJson(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const task = { id: randomUUID(), project_id: project.id, title, completed: false };
      database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, task.project_id, title, Date.now());
      sendJson(response, 201, task);
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'PATCH') {
    try {
      const body = await readJson(request);
      if (typeof body.completed !== 'boolean') { sendJson(response, 400, { error: 'Completion must be a boolean' }); return; }
      const task = database.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskMatch[1]);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id);
      if (project.archived) { sendJson(response, 409, { error: 'Archived project tasks cannot be changed' }); return; }
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, taskMatch[1]);
      if (!result.changes) { sendJson(response, 404, { error: 'Task not found' }); return; }
      sendJson(response, 200, { id: taskMatch[1], completed: body.completed });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
