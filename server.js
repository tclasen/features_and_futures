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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
    .task-row input { flex: none; }
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
      const list = element('section', undefined, { class: 'project-list', 'aria-label': 'Projects' });
      app.append(alert, form, list);
      async function refresh() {
        list.replaceChildren();
        for (const project of await loadProjects()) {
          const row = element('div', undefined, { class: 'project-row', 'data-testid': 'project-row' });
          const name = element('span', project.name, { class: 'project-name' });
          const open = element('button', 'Open project', { type: 'button' });
          open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
          row.append(name, open);
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
      const alert = element('p', '', { role: 'alert', hidden: '' });
      const form = element('form');
      const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', autocomplete: 'off' });
      const submit = element('button', 'Create task', { type: 'submit' });
      form.append(input, submit);
      const controls = element('div', undefined, { class: 'task-controls' });
      const filterLabel = element('label', 'Task filter');
      const filter = element('select', undefined, { 'aria-label': 'Task filter' });
      for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
      filterLabel.append(filter);
      const list = element('section', undefined, { class: 'project-list', 'aria-label': 'Tasks' });
      app.append(alert, form, controls, list);
      controls.append(filterLabel);
      async function refresh() {
        const taskResponse = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks');
        if (!taskResponse.ok) throw new Error('Could not load tasks');
        const tasks = await taskResponse.json();
        list.replaceChildren();
        for (const task of tasks) {
          if ((filter.value === 'Open' && task.completed) || (filter.value === 'Completed' && !task.completed)) continue;
          const row = element('div', undefined, { class: 'task-row', 'data-testid': 'task-row' });
          const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': 'Complete ' + task.title });
          checkbox.checked = Boolean(task.completed);
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
          row.append(checkbox, element('span', task.title));
          list.append(row);
        }
      }
      filter.addEventListener('change', () => refresh().catch(showLoadError));
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
        filter.value = 'All';
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
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
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
    const result = createTask.run(projectId, title);
    sendJson(response, 201, getTask.get(Number(result.lastInsertRowid), projectId));
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') { sendJson(response, 400, { error: 'Completed must be a boolean' }); return; }
    const result = updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) { sendJson(response, 404, { error: 'Task not found' }); return; }
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
