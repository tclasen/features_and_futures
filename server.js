import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; padding: 3rem 1rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #d9e0e8; border-radius: 12px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; align-items: end; flex-wrap: wrap; }
    label { display: grid; gap: .35rem; font-weight: 600; }
    input, button { font: inherit; padding: .65rem .8rem; border: 1px solid #aeb9c6; border-radius: 6px; }
    button { cursor: pointer; background: #174ea6; color: white; border-color: #174ea6; }
    button.secondary { background: white; color: #174ea6; }
    ul { padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .7rem; padding: .7rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] input { padding: 0; }
    .task-controls { margin-top: 1.5rem; }
    [role="alert"] { color: #a32626; margin: .75rem 0; }
  </style>
</head>
<body>
  <main id="app"><p>Loading…</p></main>
  <script>
    const app = document.querySelector('#app');
    const escId = (value) => encodeURIComponent(value);
    async function getProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    async function showList() {
      const projects = await getProjects();
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (!response.ok) return;
        await showList();
      });
      app.append(form, alert);
      const list = document.createElement('ul');
      for (const project of projects) {
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + escId(project.id); });
        row.append(name, open);
        list.append(row);
      }
      app.append(list);
    }
    async function showProject(id) {
      const response = await fetch('/api/projects/' + escId(id));
      app.replaceChildren();
      if (!response.ok) {
        const heading = document.createElement('h1');
        heading.textContent = 'Project not found';
        app.append(heading);
      } else {
        const project = await response.json();
        const heading = document.createElement('h1');
        heading.textContent = project.name;
        const back = document.createElement('button');
        back.textContent = 'Projects';
        back.addEventListener('click', () => { location.href = '/'; });
        app.append(heading, back);
        const form = document.createElement('form');
        form.className = 'task-controls';
        const label = document.createElement('label');
        label.textContent = 'Task title';
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('aria-label', 'Task title');
        label.append(input);
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Create task';
        form.append(label, submit);
        const alert = document.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.hidden = true;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const title = input.value.trim();
          if (!title) {
            alert.textContent = 'Task title is required';
            alert.hidden = false;
            input.focus();
            return;
          }
          const created = await fetch('/api/projects/' + escId(id) + '/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (created.ok) await showProject(id);
        });
        app.append(form, alert);
        const filterLabel = document.createElement('label');
        filterLabel.textContent = 'Task filter';
        const filter = document.createElement('select');
        filter.setAttribute('aria-label', 'Task filter');
        for (const value of ['All', 'Open', 'Completed']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          filter.append(option);
        }
        filterLabel.append(filter);
        app.append(filterLabel);
        const tasksResponse = await fetch('/api/projects/' + escId(id) + '/tasks');
        const tasks = await tasksResponse.json();
        const list = document.createElement('ul');
        function renderTasks() {
          list.replaceChildren();
          for (const task of tasks) {
            if (filter.value === 'Open' && task.completed) continue;
            if (filter.value === 'Completed' && !task.completed) continue;
            const row = document.createElement('li');
            row.dataset.testid = 'task-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(task.completed);
            checkbox.setAttribute('aria-label', 'Complete ' + task.title);
            checkbox.addEventListener('change', async () => {
              const updated = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
              });
              if (updated.ok) {
                task.completed = checkbox.checked ? 1 : 0;
                renderTasks();
              }
            });
            const title = document.createElement('span');
            title.textContent = task.title;
            row.append(checkbox, title);
            list.append(row);
          }
        }
        filter.addEventListener('change', renderTasks);
        renderTasks();
        app.append(list);
      }
    }
    const match = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);
    (match ? showProject(decodeURIComponent(match[1])) : showList()).catch(() => {
      app.textContent = 'Unable to load Workboard';
    });
  </script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, listProjects.all());
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = createProject.run(name);
    return sendJson(response, 201, findProject.get(result.lastInsertRowid));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollectionMatch) {
    const projectId = Number(taskCollectionMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = createTask.run(projectId, title);
      return sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const body = await readJson(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'completed must be a boolean' });
    updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    const task = findTask.get(taskId, projectId);
    return task ? sendJson(response, 200, task) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
