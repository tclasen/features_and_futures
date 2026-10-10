import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const priorities = ['Low', 'Normal', 'High'];
const listProjects = db.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #18243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 48px auto; padding: 24px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, button, select { font: inherit; border-radius: 6px; padding: 10px 14px; }
    input[type="checkbox"] { width: auto; }
    .task label { margin: 0; }
    .filter { margin-top: 24px; }
    input { border: 1px solid #8190a6; width: 100%; }
    button { background: #234fc1; color: white; border: 1px solid #234fc1; cursor: pointer; }
    button:hover { background: #193b95; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.6; }
    :focus-visible { outline: 3px solid #bd7400; outline-offset: 3px; }
    .create { background: white; padding: 24px; border-radius: 10px; }
    .create button { margin-top: 12px; }
    .projects { padding: 0; list-style: none; }
    .project { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #dde3ed; padding: 16px; margin: 12px 0; border-radius: 8px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #9d1526; }
    @media (max-width: 480px) { main { margin: 16px auto; padding: 16px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', name = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <h2>Projects</h2>
    ${projects.length ? `<ul class="projects">${projects.map(project => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>` : '<p>No projects yet.</p>'}
  `);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return priorities.includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '', renameError = '', priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create" method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <h2>Tasks</h2>
    ${tasks.length ? `<ul class="projects">${tasks.map(task => `
      <li class="project task" data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          ${filterFields}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"> Complete</label>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </li>`).join('')}</ul>` : '<p>No tasks to show.</p>'}
  `);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      const name = (body.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required', '', projectFilter(body.get('filter'))));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const projectId = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await readForm(request);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', '', priority));
        return;
      }
      if (!priorities.includes(body.get('priority'))) {
        sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', '', priority));
        return;
      }
      setDefaultPriority.run(body.get('priority'), projectId);
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}&priorityFilter=${priority}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const projectId = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await readForm(request);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, '', 'Archived project is read-only', priority));
        return;
      }
      const name = (body.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectPage(project, filter, '', 'Project name is required', priority));
        return;
      }
      renameProject.run(name, projectId);
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}&priorityFilter=${priority}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const [, , id, action] = url.pathname.split('/');
      const projectId = Number(id);
      if (!Number.isSafeInteger(projectId) || !setArchived.run(action === 'archive' ? 1 : 0, projectId).changes) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(?:rename|priority))?)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await readForm(request);
      const filter = taskFilter(body.get('filter'));
      const selectedPriority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', '', selectedPriority));
        return;
      }
      if (parts[5] === 'priority') {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, projectId)) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        const priority = body.get('priority');
        if (!priorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', '', selectedPriority));
          return;
        }
        setTaskPriority.run(priority, taskId, projectId);
      } else if (parts[5] === 'rename') {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, projectId)) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        const title = (body.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', '', selectedPriority));
          return;
        }
        renameTask.run(title, taskId, projectId);
      } else if (parts[4]) {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !updateTask.run(body.get('completed') === '1' ? 1 : 0, taskId, projectId).changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (body.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', '', selectedPriority));
          return;
        }
        createTask.run(projectId, title, project.default_priority);
      }
      response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}&priorityFilter=${selectedPriority}` });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', priorityFilter(url.searchParams.get('priorityFilter'))));
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, page('Error', error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
