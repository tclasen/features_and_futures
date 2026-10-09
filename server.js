import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);
// Upgrade databases created by the earlier project/tasks tasks.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17212b; background: #f5f7fa; }
    body { margin: 0; }
    main { width: min(680px, calc(100% - 40px)); margin: 56px auto; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 10px; margin-bottom: 24px; }
    label { display: block; margin-bottom: 7px; font-weight: 600; }
    .field { flex: 1; }
    input { box-sizing: border-box; width: 100%; padding: 11px 12px; border: 1px solid #aab5c1; border-radius: 6px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 10px 15px; background: #145ec8; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #0d4da8; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px; margin: 10px 0; background: white; border: 1px solid #d9e0e7; border-radius: 8px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 13px 15px; margin: 10px 0; background: white; border: 1px solid #d9e0e7; border-radius: 8px; }
    .task-row input { width: auto; }
    .task-form { align-items: end; }
    .filters { margin-bottom: 18px; }
    .alert { color: #a32323; margin: 0 0 16px; }
    .back { margin-bottom: 24px; background: #455568; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const projectPath = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }

    async function showList() {
      app.innerHTML = '<h1>Workboard</h1><form id="create-form"><div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"></div><button type="submit">Create project</button></form><p id="alert" class="alert" role="alert" hidden></p><div class="filters"><label for="project-filter">Project filter</label><select id="project-filter"><option>Active</option><option>Archived</option></select></div><section id="projects" aria-label="Projects"></section>';
      const form = document.querySelector('#create-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = new FormData(form).get('name').trim();
        const alert = document.querySelector('#alert');
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          return;
        }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (response.ok) await renderProjects();
      });
      document.querySelector('#project-filter').addEventListener('change', renderProjects);
      await renderProjects();
    }

    async function renderProjects() {
      const projects = await loadProjects();
      const filter = document.querySelector('#project-filter').value;
      const list = document.querySelector('#projects');
      list.replaceChildren(...projects.filter((project) => Boolean(project.archived) === (filter === 'Archived')).map((project) => {
        const row = document.createElement('div');
        row.className = 'project-row';
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
        const summary = document.createElement('span');
        summary.dataset.testid = 'project-summary';
        summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.textContent = project.archived ? 'Restore project' : 'Archive project';
        archive.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          if (result.ok) await renderProjects();
        });
        row.append(name, summary, open, archive);
        return row;
      }));
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) {
        app.innerHTML = '<h1>Project not found</h1><button class="back" type="button">Projects</button>';
      } else {
        const project = await response.json();
        app.innerHTML = '<button class="back" type="button">Projects</button><h1></h1><p id="archived-notice" hidden>Archived project</p><form id="task-form" class="task-form"><div class="field"><label for="task-title">Task title</label><input id="task-title" name="title" type="text" autocomplete="off"></div><button type="submit">Create task</button></form><p id="alert" class="alert" role="alert" hidden></p><div class="filters"><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></div><section id="tasks" aria-label="Tasks"></section>';
        app.querySelector('h1').textContent = project.name;
        if (project.archived) {
          document.querySelector('#archived-notice').hidden = false;
          document.querySelector('#task-title').disabled = true;
          document.querySelector('#task-form button').disabled = true;
        }
        const form = document.querySelector('#task-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const title = new FormData(form).get('title').trim();
          const alert = document.querySelector('#alert');
          if (!title) {
            alert.textContent = 'Task title is required';
            alert.hidden = false;
            return;
          }
          const result = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
          if (result.ok) { form.reset(); alert.hidden = true; await renderTasks(id); }
        });
        document.querySelector('#task-filter').addEventListener('change', () => renderTasks(id));
        await renderTasks(id);
      }
      app.querySelector('.back').addEventListener('click', () => { location.href = '/'; });
    }

    async function renderTasks(projectId) {
      const response = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/tasks');
      if (!response.ok) return;
      const tasks = await response.json();
      const filter = document.querySelector('#task-filter').value;
      const visible = tasks.filter((task) => filter === 'All' || (filter === 'Open' && !task.completed) || (filter === 'Completed' && task.completed));
      const list = document.querySelector('#tasks');
      list.replaceChildren(...visible.map((task) => {
        const row = document.createElement('div');
        row.className = 'task-row';
        row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = Boolean(task.archived);
        checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => {
          const result = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          if (result.ok) await renderTasks(projectId);
        });
        const title = document.createElement('span');
        title.textContent = task.title;
        row.append(checkbox, title);
        return row;
      }));
    }

    if (projectPath) showProject(decodeURIComponent(projectPath[1]));
    else showList();
  </script>
</body>
</html>`;

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    send(response, 200, page, 'text/html; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && /^\/projects\/[^/]+\/?$/.test(url.pathname)) {
    send(response, 200, page, 'text/html; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.created_at, p.rowid`).all()
      .map((project) => ({ ...project, archived: Boolean(project.archived) }));
    send(response, 200, JSON.stringify(projects));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readJson(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        send(response, 400, JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const project = { id: randomUUID(), name: trimmedName };
      database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
      send(response, 201, JSON.stringify(project));
    } catch {
      send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const { archived } = await readJson(request);
      if (typeof archived !== 'boolean') {
        send(response, 400, JSON.stringify({ error: 'Archived must be a boolean' }));
        return;
      }
      const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, decodeURIComponent(archiveMatch[1]));
      send(response, result.changes ? 200 : 404, JSON.stringify(result.changes ? { archived } : { error: 'Project not found' }));
    } catch {
      send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(decodeURIComponent(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    send(response, project ? 200 : 404, JSON.stringify(project || { error: 'Project not found' }));
    return;
  }
  const projectTasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (projectTasksMatch) {
    const projectId = decodeURIComponent(projectTasksMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      send(response, 404, JSON.stringify({ error: 'Project not found' }));
      return;
    }
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId);
      send(response, 200, JSON.stringify(tasks.map((task) => ({ ...task, completed: Boolean(task.completed), archived: Boolean(project.archived) }))));
      return;
    }
    if (request.method === 'POST') {
      if (project.archived) {
        send(response, 403, JSON.stringify({ error: 'Archived project' }));
        return;
      }
      try {
        const { title } = await readJson(request);
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) {
          send(response, 400, JSON.stringify({ error: 'Task title is required' }));
          return;
        }
        const task = { id: randomUUID(), title: trimmedTitle, completed: false };
        database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, projectId, task.title, Date.now());
        send(response, 201, JSON.stringify(task));
      } catch {
        send(response, 400, JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
    const taskId = decodeURIComponent(url.pathname.slice('/api/tasks/'.length));
    try {
      const { completed } = await readJson(request);
      if (typeof completed !== 'boolean') {
        send(response, 400, JSON.stringify({ error: 'Completed must be a boolean' }));
        return;
      }
      const taskProject = database.prepare('SELECT projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(taskId);
      if (taskProject?.archived) {
        send(response, 403, JSON.stringify({ error: 'Archived project' }));
        return;
      }
      const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, taskId);
      send(response, result.changes ? 200 : 404, JSON.stringify(result.changes ? { id: taskId, completed } : { error: 'Task not found' }));
    } catch {
      send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
