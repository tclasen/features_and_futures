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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const projectFilter = value => value === 'Archived' ? 'Archived' : 'Active';
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const completeTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];
const priorityFilters = ['All', ...priorities];
const priorityFilter = value => priorityFilters.includes(value) ? value : 'All';
const taskFilter = value => ['All', 'Open', 'Completed'].includes(value) ? value : 'All';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    body { margin: 0; background: #f5f7fa; color: #182638; font: 17px system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 0 24px; }
    h1 { overflow-wrap: anywhere; }
    form { margin: 24px 0; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input { box-sizing: border-box; max-width: 100%; width: 340px; padding: 12px; border: 1px solid #8b98a8; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #215ec0; color: white; font: inherit; cursor: pointer; }
    input:focus-visible, button:focus-visible { outline: 3px solid #e08b00; outline-offset: 3px; }
    .project { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 18px; margin: 12px 0; background: white; border: 1px solid #d8e0eb; border-radius: 8px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { margin: 0; flex-shrink: 0; }
    .project { flex-wrap: wrap; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.6; }
    .task { padding: 18px; margin: 12px 0; background: white; border: 1px solid #d8e0eb; border-radius: 8px; overflow-wrap: anywhere; }
    .task form { margin: 0; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; }
    input[type=checkbox] { width: 22px; height: 22px; flex-shrink: 0; }
    select { padding: 10px; font: inherit; }
    select:focus-visible { outline: 3px solid #e08b00; outline-offset: 3px; }
    [role=alert] { color: #a51c28; }
    @media (max-width: 520px) { main { margin-top: 30px; } .create button { margin-top: 12px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects">
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', selectedPriority = 'All') {
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (selectedPriority === 'All' || task.priority === selectedPriority));
  return page(`<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="priorityFilter" value="${selectedPriority}">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${priorityFilters.map(option => `<option${option === selectedPriority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map(task => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="priorityFilter" value="${selectedPriority}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="priorityFilter" value="${selectedPriority}">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="priorityFilter" value="${selectedPriority}">
          <input type="hidden" name="filter" value="${filter}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map(priority => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
      </div>`).join('')}
    </section>`);
}

async function formData(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let selectedPriority = priorityFilter(url.searchParams.get('priorityFilter'));
    const readForm = async () => {
      const data = await formData(request);
      selectedPriority = priorityFilter(data.get('priorityFilter'));
      return data;
    };
    const detailPage = (project, filter, error) => projectPage(project, filter, error, selectedPriority);
    const detailLocation = (id, filter) => `/projects/${id}?filter=${filter}${selectedPriority === 'All' ? '' : `&priorityFilter=${selectedPriority}`}`;
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024 * 1024) {
          html(response, 413, page('<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const id = Number(projectId);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      archiveProject.run(action === 'archive' ? 1 : 0, id);
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const data = await readForm();
      const filter = taskFilter(data.get('filter'));
      if (project.archived) {
        html(response, 403, detailPage(project, filter, 'Archived project is read-only'));
        return;
      }
      const name = (data.get('name') || '').trim();
      if (!name) {
        html(response, 400, detailPage(project, filter, 'Project name is required'));
        return;
      }
      renameProject.run(name, id);
      response.writeHead(303, { Location: detailLocation(id, filter) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/priority$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const id = Number(projectId);
      const task = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(task) || !findTask.get(task, id)) {
        html(response, 404, page('<h1>Task not found</h1>'));
        return;
      }
      const data = await readForm();
      const filter = taskFilter(data.get('filter'));
      if (project.archived) {
        html(response, 403, detailPage(project, filter, 'Archived project is read-only'));
        return;
      }
      const priority = data.get('priority');
      if (!priorities.includes(priority)) {
        html(response, 400, detailPage(project, filter, 'Invalid task priority'));
        return;
      }
      setTaskPriority.run(priority, task, id);
      response.writeHead(303, { Location: detailLocation(id, filter) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/rename$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const id = Number(projectId);
      const task = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(task) || !findTask.get(task, id)) {
        html(response, 404, page('<h1>Task not found</h1>'));
        return;
      }
      const data = await readForm();
      const filter = taskFilter(data.get('filter'));
      if (project.archived) {
        html(response, 403, detailPage(project, filter, 'Archived project is read-only'));
        return;
      }
      const title = (data.get('title') || '').trim();
      if (!title) {
        html(response, 400, detailPage(project, filter, 'Task title is required'));
        return;
      }
      renameTask.run(title, task, id);
      response.writeHead(303, { Location: detailLocation(id, filter) });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1>'));
        return;
      }
      const data = await readForm();
      const filter = taskFilter(data.get('filter'));
      if (project.archived) {
        html(response, 403, detailPage(project, filter, 'Archived project is read-only'));
        return;
      }
      if (taskId) {
        const task = Number(taskId);
        if (!Number.isSafeInteger(task) || !completeTask.run(data.get('completed') === '1' ? 1 : 0, task, id).changes) {
          html(response, 404, page('<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (data.get('title') || '').trim();
        if (!title) {
          html(response, 400, detailPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(id, title);
      }
      response.writeHead(303, { Location: detailLocation(id, filter) });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
    } else {
      html(response, 404, page('<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
