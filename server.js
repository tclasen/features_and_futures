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
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];
const taskFilter = (value) => ['Open', 'Completed'].includes(value) ? value : 'All';
const priorityFilter = (value) => priorities.includes(value) ? value : 'All';
const projectFilter = (value) => value === 'Archived' ? 'Archived' : 'Active';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172b42; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; letter-spacing: -1px; overflow-wrap: anywhere; }
    .intro { color: #526174; margin-bottom: 32px; }
    .panel, .project { background: white; border: 1px solid #dce2eb; border-radius: 12px; padding: 24px; }
    .rename { margin-bottom: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8492a6; border-radius: 6px; padding: 12px; font: inherit; }
    button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 12px 18px; background: #234fc4; color: white; cursor: pointer; }
    button:hover { background: #193c99; }
    button:disabled { background: #8492a6; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #b36b00; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .summary { color: #526174; margin: 8px 0 0; }
    .empty { color: #526174; }
    .filter { margin-top: 28px; }
    select { font: inherit; padding: 10px; border: 1px solid #8492a6; border-radius: 6px; background: white; }
    .task { background: white; border: 1px solid #dce2eb; border-radius: 12px; padding: 20px; }
    .task .completion-label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 20px; }
    [role="alert"] { color: #9c2222; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form class="panel" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `<div class="project" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <p class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</p></div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No active projects. Create a project above.'}</p>`}
    </section>`);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null, priority = 'All') {
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(project.name, `<form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p class="intro">Archived project</p>' : ''}
    <form class="panel rename" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <div class="fields"><input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
    </form>
    <form class="panel rename" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${priorities.map((option) => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="panel" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <div class="fields"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...priorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `<div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label class="completion-label"><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="fields"><input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
          ${taskRenameError?.id === task.id ? `<p role="alert">${escapeHtml(taskRenameError.message)}</p>` : ''}
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${priorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
      </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

async function readForm(req) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function projectLocation(id, filter, priority) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  return `/projects/${id}${query.size ? `?${query}` : ''}`;
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && path === '/') {
      html(res, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (req.method === 'POST' && path === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(res, '/');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Task priority must be Low, Normal, or High', '', null, selectedPriority));
        return;
      }
      setDefaultPriority.run(priority, id);
      redirect(res, projectLocation(id, filter, selectedPriority));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(res, 409, projectPage(project, filter, '', 'Archived project', null, selectedPriority));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(res, 422, projectPage(project, filter, '', 'Project name is required', null, selectedPriority));
        return;
      }
      renameProject.run(name, id);
      redirect(res, projectLocation(id, filter, selectedPriority));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(path)) {
      const id = Number(path.split('/')[2]);
      if (!Number.isSafeInteger(id) || !findProject.get(id)) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const archived = path.endsWith('/archive');
      setProjectArchived.run(archived ? 1 : 0, id);
      redirect(res, archived ? '/' : '/?filter=Archived');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/priority$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority));
        return;
      }
      const priority = form.get('priority');
      if (!priorities.includes(priority)) {
        html(res, 422, projectPage(project, filter, 'Task priority must be Low, Normal, or High', '', null, selectedPriority));
        return;
      }
      setTaskPriority.run(priority, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks\/\d+\/rename$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const taskNumber = Number(taskId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      if (!Number.isSafeInteger(taskNumber) || !findTask.get(taskNumber, id)) {
        html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority));
        return;
      }
      const title = (form.get('title') || '').trim();
      if (!title) {
        html(res, 422, projectPage(project, filter, '', '', {
          id: taskNumber, message: 'Task title is required',
        }, selectedPriority));
        return;
      }
      renameTask.run(title, taskNumber, id);
      redirect(res, projectLocation(id, filter, selectedPriority));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        html(res, 409, projectPage(project, filter, 'Archived project', '', null, selectedPriority));
        return;
      }
      if (taskId) {
        const taskNumber = Number(taskId);
        const result = Number.isSafeInteger(taskNumber)
          ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskNumber, id)
          : { changes: 0 };
        if (!result.changes) {
          html(res, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, filter, 'Task title is required', '', null, selectedPriority));
          return;
        }
        createTask.run(id, title, project.default_priority);
      }
      redirect(res, projectLocation(id, filter, selectedPriority));
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', null, priorityFilter(url.searchParams.get('priorityFilter'))));
      } else {
        html(res, 404, page('Project not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
      }
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
