import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, id);`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id ASC');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6fa; color: #182339; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  input { width: 100%; padding: 10px; font: inherit; border: 1px solid #7c899f; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #2457b8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #19448f; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  :focus-visible { outline: 3px solid #b25d00; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  [role=alert] { color: #9d1829; background: #fff0f2; padding: 12px; border-radius: 6px; }
  .projects, .tasks, .create, .filter { margin-top: 32px; }
  select { padding: 10px; font: inherit; }
  .task { border-top: 1px solid #dce2eb; padding: 16px 0; }
  .task label { display: flex; gap: 12px; align-items: center; margin: 0; overflow-wrap: anywhere; }
  .task input[type=checkbox] { width: auto; flex-shrink: 0; }
  .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dce2eb; }
  .project span { overflow-wrap: anywhere; min-width: 0; }
  .project form { flex-shrink: 0; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${projects.length ? projects.map(project => `
      <div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
        </form>
      </div>`).join('') : '<p>No projects yet.</p>'}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  if ((from && !validDueDate(from)) || (through && !validDueDate(through)) ||
      (from && through && from > through)) return { from: '', through: '' };
  return { from, through };
}

function projectLocation(id, filter, priority, range) {
  const params = new URLSearchParams({ filter });
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  return `/projects/${id}?${params}`;
}

function projectPage(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}"><input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="filter" method="post" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <section class="tasks" aria-label="Tasks">${tasks.length ? tasks.map(task => `
      <div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
      </div>`).join('') : '<p>No matching tasks.</p>'}</section>`).replaceAll('</form>', `${rangeFields}</form>`);
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function sendHtml(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = dueRange(form);
      const from = (form.get('from') || '').trim();
      const through = (form.get('through') || '').trim();
      const error = (from && !validDueDate(from)) || (through && !validDueDate(through))
        ? 'Due range must use valid YYYY-MM-DD dates'
        : from && through && from > through ? 'Due from must not be after Due through' : '';
      if (error) {
        sendHtml(res, 200, projectPage(project, filter, error, priority, previous));
        return;
      }
      res.writeHead(303, { Location: projectLocation(id, filter, priority, { from, through }) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      const priority = form.get('priority');
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
        return;
      }
      updateDefaultPriority.run(priority, id);
      res.writeHead(303, { Location: projectLocation(id, filter, selectedPriority, dueRange(form)) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', priority, dueRange(form)));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectPage(project, filter, 'Project name is required', priority, dueRange(form)));
        return;
      }
      renameProject.run(name, id);
      res.writeHead(303, { Location: projectLocation(id, filter, priority, dueRange(form)) });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      if (!Number.isSafeInteger(id) || !getProject.get(id)) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const archived = url.pathname.endsWith('/archive');
      archiveProject.run(archived ? 1 : 0, id);
      res.writeHead(303, { Location: `/?filter=${archived ? 'Active' : 'Archived'}` });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/(?:rename|priority|due-date))?)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const selectedPriority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed', selectedPriority, dueRange(form)));
        return;
      }
      if (parts[4]) {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !getTask.get(taskId, projectId)) {
          sendHtml(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        if (parts[5] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
            return;
          }
          renameTask.run(title, taskId, projectId);
        } else if (parts[5] === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            sendHtml(res, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, dueRange(form)));
            return;
          }
          updateDueDate.run(dueDate, taskId, projectId);
        } else if (parts[5] === 'priority') {
          const priority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(priority)) {
            sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority, dueRange(form)));
            return;
          }
          updatePriority.run(priority, taskId, projectId);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority, dueRange(form)));
          return;
        }
        createTask.run(projectId, title, project.default_priority);
      }
      res.writeHead(303, { Location: projectLocation(projectId, filter, selectedPriority, dueRange(form)) });
      res.end();
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Unable to complete request'}</h1>`));
    else res.end();
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
