import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const databasePath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  )
`);
// Upgrade databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  )
`);

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
  FROM projects p ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendPage(response) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1c2634; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 56px auto; padding: 0 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; font-weight: 600; }
    input, select { box-sizing: border-box; padding: 10px 12px; border: 1px solid #aeb9c8; border-radius: 5px; font: inherit; }
    input { width: min(440px, 60vw); }
    button { padding: 10px 14px; border: 0; border-radius: 5px; background: #2459a6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194783; }
    #error { margin: 0 0 16px; color: #a32222; }
    [hidden] { display: none !important; }
    #projects { display: grid; gap: 10px; padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid #d6dde7; border-radius: 6px; background: white; }
    .project-actions { display: flex; gap: 8px; align-items: center; }
    [data-testid="project-summary"] { color: #536173; white-space: nowrap; }
    #tasks { display: grid; gap: 10px; padding: 0; list-style: none; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid #d6dde7; border-radius: 6px; background: white; }
    [data-testid="task-row"] input { width: auto; }
    #detail { margin-bottom: 20px; }
    @media (max-width: 520px) { form { align-items: stretch; flex-direction: column; } input { width: 100%; } button { align-self: start; } }
  </style>
</head>
<body>
  <main>
    <p id="error" role="alert" hidden></p>
    <section id="project-list">
      <h1>Workboard</h1>
      <form id="create-form">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </form>
      <label for="project-filter">Project filter</label>
      <select id="project-filter"><option>Active</option><option>Archived</option></select>
      <ul id="projects" aria-label="Projects"></ul>
    </section>
    <section id="detail" hidden>
      <button id="back" type="button">Projects</button>
      <h1 id="project-title"></h1>
      <p id="archived-notice" hidden>Archived project</p>
      <form id="rename-form">
        <label for="new-project-name">New project name</label>
        <input id="new-project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </form>
      <form id="task-form">
        <label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </form>
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option>All</option><option>Open</option><option>Completed</option>
      </select>
      <ul id="tasks" aria-label="Tasks"></ul>
    </section>
  </main>
  <script>
    const listView = document.querySelector('#project-list');
    const detailView = document.querySelector('#detail');
    const projectList = document.querySelector('#projects');
    const error = document.querySelector('#error');
    const taskList = document.querySelector('#tasks');
    let currentProjectId = null;
    let currentProjectArchived = false;

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Unable to load projects');
      return response.json();
    }

    async function showList() {
      listView.hidden = false;
      detailView.hidden = true;
      error.hidden = true;
      projectList.replaceChildren();
      const selectedState = document.querySelector('#project-filter').value;
      for (const project of await loadProjects()) {
        if (Boolean(project.archived) !== (selectedState === 'Archived')) continue;
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const summary = document.createElement('span');
        summary.dataset.testid = 'project-summary';
        summary.textContent = project.completed_count + '/' + project.total_count + ' completed';
        const actions = document.createElement('div');
        actions.className = 'project-actions';
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { window.location.href = '/projects/' + encodeURIComponent(project.id); });
        actions.append(open);
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.textContent = project.archived ? 'Restore project' : 'Archive project';
        archive.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + project.id + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          if (!result.ok) throw new Error('Unable to update project');
          await showList();
        });
        actions.append(archive);
        row.append(name, summary, actions);
        projectList.append(row);
      }
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { window.location.replace('/'); return; }
      const project = await response.json();
      currentProjectId = id;
      listView.hidden = true;
      detailView.hidden = false;
      document.querySelector('#project-title').textContent = project.name;
      const archived = Boolean(project.archived);
      currentProjectArchived = archived;
      document.querySelector('#archived-notice').hidden = !archived;
      document.querySelector('#new-project-name').disabled = archived;
      document.querySelector('#rename-form button').disabled = archived;
      document.querySelector('#task-form button').disabled = archived;
      error.hidden = true;
      await renderTasks();
    }

    async function renderTasks() {
      if (!currentProjectId) return;
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks');
      if (!response.ok) throw new Error('Unable to load tasks');
      const tasks = await response.json();
      const filter = document.querySelector('#task-filter').value;
      taskList.replaceChildren();
      for (const task of tasks) {
        if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
        const row = document.createElement('li');
        row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = currentProjectArchived;
        checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => {
          const updated = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          if (!updated.ok) throw new Error('Unable to update task');
          await renderTasks();
        });
        const title = document.createElement('span');
        title.textContent = task.title;
        row.append(checkbox, title);
        taskList.append(row);
      }
    }

    document.querySelector('#task-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#task-title');
      const title = input.value.trim();
      if (!title) {
        error.textContent = 'Task title is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error('Unable to create task');
      input.value = '';
      await renderTasks();
    });
    document.querySelector('#rename-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#new-project-name');
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'Project name is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/name', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to rename project');
      document.querySelector('#project-title').textContent = name;
      input.value = '';
    });
    document.querySelector('#task-filter').addEventListener('change', renderTasks);
    document.querySelector('#project-filter').addEventListener('change', showList);

    document.querySelector('#create-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#project-name');
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'Project name is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to create project');
      input.value = '';
      await showList();
    });

    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    const match = window.location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) showProject(match[1]);
    else showList();
  </script>
</body>
</html>`);
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) sendJson(response, 404, { error: 'Project not found' });
    else sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(archiveMatch[1]);
      const body = await readRequestBody(request);
      if (typeof body.archived !== 'boolean') { sendJson(response, 400, { error: 'archived must be a boolean' }); return; }
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      setProjectArchived.run(body.archived ? 1 : 0, projectId);
      sendJson(response, 200, { ...project, archived: body.archived });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/name$/);
  if (renameMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(renameMatch[1]);
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot be renamed' }); return; }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) sendJson(response, 404, { error: 'Project not found' });
    else sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    return;
  }
  if (tasksMatch && request.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot have new tasks' }); return; }
      const body = await readRequestBody(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const result = createTask.run(projectId, title);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change task completion' }); return; }
      const body = await readRequestBody(request);
      if (typeof body.completed !== 'boolean') { sendJson(response, 400, { error: 'completed must be a boolean' }); return; }
      const task = getTask.get(taskId, projectId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      sendJson(response, 200, { ...task, completed: body.completed });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    sendPage(response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
