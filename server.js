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
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
// Migrate databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive Normal priority while retaining their IDs and state.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workboard</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #182434; background: #f4f6fa; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  input { width: 100%; padding: 12px; font: inherit; border: 1px solid #8c98aa; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #285ac8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #1945a7; }
  button:disabled { background: #8993a5; cursor: not-allowed; }
  .row { flex-wrap: wrap; }
  :focus-visible { outline: 3px solid #edac28; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  .filter { margin-top: 24px; }
  select { padding: 10px; font: inherit; }
  .task-check { width: 22px; height: 22px; }
  .task-title { flex: 1; margin: 0; overflow-wrap: anywhere; }
  .projects { margin-top: 32px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce2eb; padding: 16px 0; }
  .name { overflow-wrap: anywhere; min-width: 0; }
  .row form { flex-shrink: 0; }
  [role=alert] { color: #a21725; background: #fff0f1; padding: 12px; border-radius: 6px; }
  @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', name = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `<div class="row" data-testid="project-row">
    <span class="name">${escape(project.name)}</span>
    <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
    <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
      <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
    </form>
  </div>`).join('');
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escape(name)}">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.submit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '', priority = 'All') {
  const rows = listTasks.all(project.id)
    .filter(task => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority))
    .map(task => `<div class="row" data-testid="task-row">
      <label class="task-title" for="task-${task.id}">${escape(task.title)}</label>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <input class="task-check" id="task-${task.id}" type="checkbox" name="completed" value="1"
          aria-label="Complete ${escape(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''} onchange="this.form.submit()">
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
          ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
      </form>
      <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
        <label for="new-task-title-${task.id}">New task title</label>
        <input id="new-task-title-${task.id}" name="title" type="text" value="${escape(task.title)}"${project.archived ? ' disabled' : ''}>
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
      </form>
    </div>`).join('');
  return page(`<h1>${escape(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escape(project.name)}"${project.archived ? ' disabled' : ''}>
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.submit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.submit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">${rows || '<p>No matching tasks.</p>'}</section>`);
}

async function formBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return html(res, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(req);
      const name = (body.get('name') || '').trim();
      if (!name) return html(res, 422, projectList('Project name is required'));
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    const renameMatch = url.pathname.match(/^\/projects\/(\d+)\/rename$/);
    if (req.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const name = (body.get('name') || '').trim();
      if (!name) return html(res, 422, projectPage(project, filter, 'Project name is required', priority));
      renameProject.run(name, project.id);
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}&priorityFilter=${priority}` });
      return res.end();
    }
    const archiveMatch = url.pathname.match(/^\/projects\/(\d+)\/(archive|restore)$/);
    if (req.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (!result.changes) return html(res, 404, page('<h1>Page not found</h1>'));
      res.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
      return res.end();
    }
    const priorityMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/priority$/);
    if (req.method === 'POST' && priorityMatch) {
      const project = findProject.get(priorityMatch[1]);
      if (!project || !findTask.get(priorityMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const selectedPriority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority));
      const priority = body.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        return html(res, 422, projectPage(project, filter, 'Invalid task priority', selectedPriority));
      }
      setTaskPriority.run(priority, priorityMatch[2], project.id);
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}&priorityFilter=${selectedPriority}` });
      return res.end();
    }
    const taskRenameMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
    if (req.method === 'POST' && taskRenameMatch) {
      const project = findProject.get(taskRenameMatch[1]);
      if (!project || !findTask.get(taskRenameMatch[2], project.id)) {
        return html(res, 404, page('<h1>Task not found</h1>'));
      }
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      const title = (body.get('title') || '').trim();
      if (!title) return html(res, 422, projectPage(project, filter, 'Task title is required', priority));
      renameTask.run(title, taskRenameMatch[2], project.id);
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}&priorityFilter=${priority}` });
      return res.end();
    }
    const taskMatch = url.pathname.match(/^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (req.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) return html(res, 404, page('<h1>Page not found</h1>'));
      const body = await formBody(req);
      const filter = taskFilter(body.get('filter'));
      const priority = priorityFilter(body.get('priorityFilter'));
      if (project.archived) return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority));
      if (taskMatch[2]) {
        const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
        if (!result.changes) return html(res, 404, page('<h1>Task not found</h1>'));
      } else {
        const title = (body.get('title') || '').trim();
        if (!title) return html(res, 422, projectPage(project, filter, 'Task title is required', priority));
        createTask.run(project.id, title);
      }
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}&priorityFilter=${priority}` });
      return res.end();
    }
    const match = url.pathname.match(/^\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) return html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
    }
    html(res, 404, page('<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, error.status || 500, page(`<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
