import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
// Upgrade databases created before archive support without changing IDs or tasks.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
// Upgrade earlier task databases in place, defaulting every existing task to Normal.
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const completeTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const taskFilter = (value) => ['Open', 'Completed'].includes(value) ? value : 'All';
const priorityFilter = (value) => ['Low', 'Normal', 'High'].includes(value) ? value : 'All';
const projectLocation = (id, filter, priority) => `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
const projectFilter = (value) => value === 'Archived' ? 'Archived' : 'Active';
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 17px/1.5 system-ui, sans-serif; color: #17283b; background: #f5f7fa; }
  main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  select { padding: 10px; font: inherit; margin-bottom: 12px; }
  .tasks { margin-top: 28px; }
  .task-row { padding: 16px 0; border-top: 1px solid #d8e0e9; overflow-wrap: anywhere; }
  .task-row label { display: flex; gap: 12px; align-items: center; font-weight: 400; }
  .task-row input { width: auto; }
  input { width: 100%; padding: 10px; font: inherit; border: 1px solid #687a90; border-radius: 5px; }
  button { padding: 10px 16px; font: inherit; color: white; background: #2459a6; border: 0; border-radius: 5px; cursor: pointer; }
  button:hover { background: #194580; }
  button:disabled { background: #687a90; cursor: not-allowed; }
  :focus-visible { outline: 3px solid #cc8300; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  .projects { margin-top: 28px; }
  .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #d8e0e9; }
  .project-row span { overflow-wrap: anywhere; min-width: 0; }
  .project-row form { flex-shrink: 0; }
  [role="alert"] { color: #a11d24; margin: 12px 0; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project-row { flex-wrap: wrap; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectsPage(error = '', enteredName = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escape(enteredName)}"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
      ${error ? `<div id="project-error" role="alert">${escape(error)}</div>` : ''}
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      <form action="/" method="get">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${projects.map((project) => `<div class="project-row" data-testid="project-row">
        <span>${escape(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </div>`).join('')}
    </section>`);
}

function projectPage(project, filter = 'All', error = '', enteredTitle = '', renameError = '', enteredName = '', taskRenameError = null, priority = 'All') {
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(project.name, `<h1>${escape(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form class="create" action="/projects/${project.id}/rename" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escape(enteredName)}"${project.archived ? ' disabled' : ''}${renameError ? ' aria-invalid="true" aria-describedby="rename-error"' : ''}>
      ${renameError ? `<div id="rename-error" role="alert">${escape(renameError)}</div>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" value="${escape(enteredTitle)}"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
      ${error ? `<div id="task-error" role="alert">${escape(error)}</div>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <section class="tasks" aria-label="Tasks">
      <form action="/projects/${project.id}" method="get">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
          ${['All', 'Low', 'Normal', 'High'].map((option) => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${tasks.map((task) => `<div class="task-row" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label><input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escape(task.title)}</span></label>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escape(taskRenameError?.id === task.id ? taskRenameError.title : '')}"${project.archived ? ' disabled' : ''}${taskRenameError?.id === task.id ? ` aria-invalid="true" aria-describedby="task-rename-error-${task.id}"` : ''}>
          ${taskRenameError?.id === task.id ? `<div id="task-rename-error-${task.id}" role="alert">Task title is required</div>` : ''}
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map((option) => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
      </div>`).join('')}
    </section>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function sendHtml(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return sendHtml(response, 200, projectsPage('', '', projectFilter(url.searchParams.get('filter'))));
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const name = enteredName.trim();
      if (!name) return sendHtml(response, 200, projectsPage('Project name is required', enteredName, projectFilter(form.get('filter'))));
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const renameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (request.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (!project) return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      if (project.archived) return sendHtml(response, 403, page('Archived project', '<h1>Archived project</h1><p>Restore the project to rename it.</p>'));
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const name = enteredName.trim();
      const filter = taskFilter(form.get('filter'));
      if (!name) return sendHtml(response, 200, projectPage(project, filter, '', '', 'Project name is required', enteredName, null, priorityFilter(form.get('priorityFilter'))));
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))) });
      return response.end();
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch) {
      if (!getProject.get(archiveMatch[1])) return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      response.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
      return response.end();
    }
    const priorityMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/priority$/);
    if (request.method === 'POST' && priorityMatch) {
      const project = getProject.get(priorityMatch[1]);
      const task = project && getTask.get(priorityMatch[2], project.id);
      if (!task) return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      if (project.archived) return sendHtml(response, 403, page('Archived project', '<h1>Archived project</h1><p>Restore the project to change its tasks.</p>'));
      const form = await readForm(request);
      const priority = form.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        return sendHtml(response, 400, page('Invalid priority', '<h1>Invalid task priority</h1>'));
      }
      setTaskPriority.run(priority, task.id, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, taskFilter(form.get('filter')), priorityFilter(form.get('priorityFilter'))) });
      return response.end();
    }
    const taskRenameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/rename$/);
    if (request.method === 'POST' && taskRenameMatch) {
      const project = getProject.get(taskRenameMatch[1]);
      const task = project && getTask.get(taskRenameMatch[2], project.id);
      if (!task) return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      if (project.archived) return sendHtml(response, 403, page('Archived project', '<h1>Archived project</h1><p>Restore the project to change its tasks.</p>'));
      const form = await readForm(request);
      const enteredTitle = form.get('title') || '';
      const title = enteredTitle.trim();
      const filter = taskFilter(form.get('filter'));
      if (!title) return sendHtml(response, 200, projectPage(project, filter, '', '', '', '', { id: task.id, title: enteredTitle }, priorityFilter(form.get('priorityFilter'))));
      renameTask.run(title, task.id, project.id);
      response.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))) });
      return response.end();
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (!project || (taskMatch[2] && !getTask.get(taskMatch[2], project.id))) {
        return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      }
      if (project.archived) return sendHtml(response, 403, page('Archived project', '<h1>Archived project</h1><p>Restore the project to change its tasks.</p>'));
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskMatch[2]) {
        completeTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
      } else {
        const enteredTitle = form.get('title') || '';
        const title = enteredTitle.trim();
        if (!title) return sendHtml(response, 200, projectPage(project, filter, 'Task title is required', enteredTitle, '', '', null, priorityFilter(form.get('priorityFilter'))));
        createTask.run(project.id, title);
      }
      response.writeHead(303, { Location: projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))) });
      return response.end();
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) return sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', '', '', null, priorityFilter(url.searchParams.get('priorityFilter'))));
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
    else response.end();
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
