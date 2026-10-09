import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const database = new DatabaseSync(process.env.DB_PATH || 'workboard.sqlite');
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

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; }
    main { max-width: 760px; margin: 48px auto; padding: 0 24px; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; align-items: end; gap: 12px; padding: 20px; background: white; border: 1px solid #dce2ec; border-radius: 10px; }
    label { display: grid; gap: 6px; flex: 1; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #aeb8c8; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #2457c5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1946a8; }
    #alert { min-height: 1.5em; margin: 10px 0; color: #a32121; }
    #projects { display: grid; gap: 10px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: white; border: 1px solid #dce2ec; border-radius: 8px; }
    .project-name { overflow-wrap: anywhere; }
    .task-controls { margin-top: 24px; }
    #tasks { display: grid; gap: 10px; margin-top: 18px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: white; border: 1px solid #dce2ec; border-radius: 8px; }
    .task-row label { display: flex; align-items: center; gap: 10px; font-weight: 400; }
    .task-row input { width: auto; }
    select { padding: 10px 12px; border: 1px solid #aeb8c8; border-radius: 6px; font: inherit; background: white; }
    a { color: inherit; text-decoration: none; }
    @media (max-width: 520px) { main { margin-top: 28px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const path = window.location.pathname;
    const projectMatch = path.match(/^\\/projects\\/(\\d+)\\/?$/);

    async function loadProjects() {
      const response = await fetch('/api/projects');
      return response.json();
    }

    function element(tag, attributes = {}, content = '') {
      const item = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
      item.textContent = content;
      return item;
    }

    async function showProjects() {
      document.title = 'Workboard';
      app.replaceChildren(element('h1', {}, 'Workboard'));
      const form = element('form');
      const label = element('label', { for: 'project-name' }, 'Project name');
      const input = element('input', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
      label.append(input);
      const submit = element('button', { type: 'submit' }, 'Create project');
      form.append(label, submit);
      const alert = element('p', { id: 'alert', role: 'alert', 'aria-live': 'polite' });
      const list = element('section', { id: 'projects', 'aria-label': 'Projects' });
      app.append(form, alert, list);

      async function refresh() {
        const projects = await loadProjects();
        list.replaceChildren(...projects.map(project => {
          const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
          row.append(element('span', { class: 'project-name' }, project.name));
          const open = element('button', { type: 'button' }, 'Open project');
          open.addEventListener('click', () => { window.location.href = '/projects/' + project.id; });
          row.append(open);
          return row;
        }));
      }

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (response.ok) {
          input.value = '';
          alert.textContent = '';
          await refresh();
        }
      });
      await refresh();
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + id);
      if (!response.ok) { window.location.replace('/'); return; }
      const project = await response.json();
      document.title = project.name + ' | Workboard';
      const back = element('button', { type: 'button' }, 'Projects');
      back.addEventListener('click', () => { window.location.href = '/'; });
      const form = element('form', { class: 'task-controls' });
      const titleLabel = element('label', { for: 'task-title' }, 'Task title');
      const titleInput = element('input', { id: 'task-title', name: 'title', type: 'text', autocomplete: 'off' });
      titleLabel.append(titleInput);
      form.append(titleLabel, element('button', { type: 'submit' }, 'Create task'));
      const alert = element('p', { id: 'alert', role: 'alert', 'aria-live': 'polite' });
      const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
      const filter = element('select', { id: 'task-filter' });
      for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value }, value));
      filterLabel.append(filter);
      const list = element('section', { id: 'tasks', 'aria-label': 'Tasks' });
      app.replaceChildren(element('h1', {}, project.name), back, form, alert, filterLabel, list);

      async function refreshTasks() {
        const tasksResponse = await fetch('/api/projects/' + id + '/tasks');
        const tasks = await tasksResponse.json();
        const visible = tasks.filter(task => filter.value === 'All' || (filter.value === 'Open' ? !task.completed : task.completed));
        list.replaceChildren(...visible.map(task => {
          const row = element('div', { 'data-testid': 'task-row', class: 'task-row' });
          const label = element('label');
          const checkbox = element('input', { type: 'checkbox', 'aria-label': 'Complete ' + task.title });
          checkbox.checked = task.completed;
          checkbox.addEventListener('change', async () => {
            await fetch('/api/projects/' + id + '/tasks/' + task.id, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
            });
            await refreshTasks();
          });
          label.append(checkbox, element('span', {}, task.title));
          row.append(label);
          return row;
        }));
      }
      filter.addEventListener('change', refreshTasks);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = titleInput.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; titleInput.focus(); return; }
        const created = await fetch('/api/projects/' + id + '/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (created.ok) { titleInput.value = ''; alert.textContent = ''; await refreshTasks(); }
      });
      await refreshTasks();
    }

    if (projectMatch) showProject(projectMatch[1]);
    else showProjects();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(response, 200, projects);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollectionMatch) {
    const projectId = Number(taskCollectionMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId)
        .map(task => ({ ...task, completed: Boolean(task.completed) }));
      return sendJson(response, 200, tasks);
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion state is required' });
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { id: taskId, completed: body.completed });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
