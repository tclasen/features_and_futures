import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPath(id, filter) {
  return `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17233b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 32px #17233b0a; }
    h1 { margin: 0 0 28px; font-size: 32px; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    .create-controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8390a6; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #234edb; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #173bb0; }
    button:disabled { background: #8390a6; cursor: default; }
    :focus-visible { outline: 3px solid #d98400; outline-offset: 3px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-top: 1px solid #e1e5ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .project-summary { color: #56637a; font-size: 14px; }
    [role="alert"] { color: #a22222; margin-top: 12px; }
    .empty { color: #56637a; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #8390a6; border-radius: 6px; }
    .task-filter { margin-top: 28px; }
    .task-row { padding: 18px 0; border-top: 1px solid #e1e5ed; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-rename label { margin-bottom: 8px; }
    .back { margin-bottom: 28px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-controls { flex-direction: column; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectDetail(project, filter = 'All', error = '', renameError = '', taskRenameError = null) {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(`<h1>${escapeHtml(project.name)}</h1>
    <form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="back" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}${renameError ? ' aria-invalid="true" aria-describedby="rename-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
      ${renameError ? `<div id="rename-error" role="alert">${escapeHtml(renameError)}</div>` : ''}
    </form>
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
      ${error ? `<div id="task-error" role="alert">${escapeHtml(error)}</div>` : ''}
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.length ? tasks.map(task => `<div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="create-controls">
            <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}${taskRenameError?.id === task.id ? ` aria-invalid="true" aria-describedby="task-rename-error-${task.id}"` : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
          ${taskRenameError?.id === task.id ? `<div id="task-rename-error-${task.id}" role="alert">${escapeHtml(taskRenameError.message)}</div>` : ''}
        </form>
      </div>`).join('') : '<p class="empty">No tasks match this filter.</p>'}
    </section>`);
}

async function formBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) return null;
  }
  return new URLSearchParams(body);
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page(`<h1>Workboard</h1>
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="name-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
      ${error ? `<div id="name-error" role="alert">${escapeHtml(error)}</div>` : ''}
    </form>
    <form class="task-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <div class="project-summary" data-testid="project-summary">${project.completed}/${project.total} completed</div>
        </div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create your first project above.'}</p>`}
    </section>`);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return html(response, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(request);
      if (!body) return html(response, 413, page('<h1>Request too large</h1>'));
      const name = (body.get('name') || '').trim();
      if (!name) return html(response, 400, projectList('Project name is required', projectFilter(body.get('filter'))));
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (!project) return html(response, 404, page('<h1>Project not found</h1>'));
      const body = await formBody(request);
      if (!body) return html(response, 413, page('<h1>Request too large</h1>'));
      const filter = taskFilter(body.get('filter'));
      if (project.archived) return html(response, 403, projectDetail(project, filter, '', 'Archived project'));
      const name = (body.get('name') || '').trim();
      if (!name) return html(response, 400, projectDetail(project, filter, '', 'Project name is required'));
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectPath(project.id, filter) });
      return response.end();
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (!result.changes) return html(response, 404, page('<h1>Project not found</h1>'));
      response.writeHead(303, { Location: archiveMatch[2] === 'restore' ? '/?filter=Archived' : '/' });
      return response.end();
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) return html(response, 200, projectDetail(project, taskFilter(url.searchParams.get('filter'))));
    }
    const taskRenameMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && taskRenameMatch) {
      const project = getProject.get(taskRenameMatch[1]);
      if (!project) return html(response, 404, page('<h1>Project not found</h1>'));
      const task = getTask.get(taskRenameMatch[2], project.id);
      if (!task) return html(response, 404, page('<h1>Task not found</h1>'));
      const body = await formBody(request);
      if (!body) return html(response, 413, page('<h1>Request too large</h1>'));
      const filter = taskFilter(body.get('filter'));
      if (project.archived) return html(response, 403, projectDetail(project, filter, 'Archived project'));
      const title = (body.get('title') || '').trim();
      if (!title) return html(response, 400, projectDetail(project, filter, '', '', { id: task.id, message: 'Task title is required' }));
      renameTask.run(title, task.id, project.id);
      response.writeHead(303, { Location: projectPath(project.id, filter) });
      return response.end();
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) return html(response, 403, projectDetail(project, taskFilter(url.searchParams.get('filter')), 'Archived project'));
        const body = await formBody(request);
        if (!body) return html(response, 413, page('<h1>Request too large</h1>'));
        const filter = taskFilter(body.get('filter'));
        if (taskMatch[2]) {
          const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) return html(response, 404, page('<h1>Task not found</h1>'));
        } else {
          const title = (body.get('title') || '').trim();
          if (!title) return html(response, 400, projectDetail(project, filter, 'Task title is required'));
          createTask.run(project.id, title);
        }
        response.writeHead(303, { Location: projectPath(project.id, filter) });
        return response.end();
      }
    }
    html(response, 404, page('<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Unable to complete request</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
