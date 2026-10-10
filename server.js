import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || resolve('data/workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
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
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  db.exec('BEGIN; ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id; COMMIT;');
}
const allProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC
`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const projectTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC');
const insertTask = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id ASC');
const moveTask = db.prepare(`UPDATE tasks SET project_id = ?,
  position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
  WHERE id = ? AND project_id = ?`);
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const priorities = ['Low', 'Normal', 'High'];
function validDueDate(value) {
  if (value === '') return true;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
const stylesheet = readFileSync(new URL('./styles.css', import.meta.url));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

const projectFilter = (value) => value === 'Archived' ? 'Archived' : 'Active';

function projectList(error = '', filter = 'Active') {
  const projects = allProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <header><p class="eyebrow">Your workspace</p><h1>Workboard</h1>
      <p class="intro">A place for your projects.</p></header>
    <section aria-labelledby="create-heading" class="card">
      <h2 id="create-heading">Create a project</h2>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects" method="post" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <div class="field"><label for="project-name">Project name</label>
          <input id="project-name" name="name" type="text" autocomplete="off"></div>
        <button type="submit">Create project</button>
      </form>
    </section>
    <section aria-labelledby="projects-heading" class="project-list">
      <h2 id="projects-heading">Projects</h2>
      <form action="/" method="get" class="filter-form">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${projects.length ? projects.map((project) => `
        <article class="project-row" data-testid="project-row">
          <div><h3>${escapeHtml(project.name)}</h3>
            <p class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</p></div>
          <div class="project-actions">
          <form action="/projects/${project.id}" method="get">
            <button class="secondary" type="submit">Open project</button>
          </form>
          <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
            <button class="secondary" type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
          </div>
        </article>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No active projects. Create a project above.'}</p>`}
    </section>`);
}

function send(res, status, body, contentType = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

const taskFilter = (value) => ['Open', 'Completed'].includes(value) ? value : 'All';

const priorityFilter = (value) => priorities.includes(value) ? value : 'All';

function dueRange(params) {
  const from = (params.get('dueFrom') || '').trim();
  const through = (params.get('dueThrough') || '').trim();
  return validDueDate(from) && validDueDate(through) && (!from || !through || from <= through)
    ? { from, through } : { from: '', through: '' };
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${range.from || ''}">
        <input type="hidden" name="dueThrough" value="${range.through || ''}">`;
}

function projectLocation(id, filter, priority, range = {}) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  return `/projects/${id}${query.size ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', renameError = '', priority = 'All', range = {}) {
  const eligibleDestinations = destinations.all(project.id);
  const moveDisabled = project.archived || !eligibleDestinations.length;
  const tasks = projectTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date !== '' &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <form action="/" method="get"><button class="secondary">Projects</button></form>
    <header class="detail"><p class="eyebrow">Project</p><h1>${escapeHtml(project.name)}</h1></header>
    ${project.archived ? '<p class="archive-notice">Archived project</p>' : ''}
    <section class="card" aria-labelledby="rename-heading">
      <h2 id="rename-heading">Rename project</h2>
      ${renameError ? `<p class="alert" role="alert">${escapeHtml(renameError)}</p>` : ''}
      <form action="/projects/${project.id}/rename" method="post" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <div class="field"><label for="new-project-name">New project name</label>
          <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </form>
    </section>
    <section class="card" aria-labelledby="create-heading">
      <h2 id="create-heading">Create a task</h2>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects/${project.id}/default-priority" method="post" class="default-priority-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${priorities.map((value) => `<option${project.default_priority === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <form action="/projects/${project.id}/tasks" method="post" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <div class="field"><label for="task-title">Task title</label>
          <input id="task-title" name="title" type="text" autocomplete="off"></div>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </form>
    </section>
    <section class="project-list" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <form action="/projects/${project.id}" method="get" class="filter-form">
        ${rangeFields(range)}
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
          ${['All', ...priorities].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form action="/projects/${project.id}/due-range" method="post" class="create-form due-range-form">
        <input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
        <div class="field"><label for="due-from">Due from</label>
          <input id="due-from" name="rangeFrom" type="text" value="${range.from || ''}" placeholder="YYYY-MM-DD"></div>
        <div class="field"><label for="due-through">Due through</label>
          <input id="due-through" name="rangeThrough" type="text" value="${range.through || ''}" placeholder="YYYY-MM-DD"></div>
        <button type="submit">Apply due range</button>
      </form>
      ${tasks.length ? tasks.map((task) => `
        <article class="task-row" data-testid="task-row">
          <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
            <label class="task-label"><input type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
              ${project.archived ? 'disabled' : ''}
              onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post" class="create-form task-rename-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
            <div class="field"><label for="new-task-title-${task.id}">New task title</label>
              <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}></div>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post" class="task-priority-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              ${priorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/due-date" method="post" class="create-form task-due-date-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
        ${rangeFields(range)}
            <div class="field"><label for="task-due-date-${task.id}">Task due date</label>
              <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" placeholder="YYYY-MM-DD"${project.archived ? ' disabled' : ''}></div>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/move" method="post" class="create-form task-move-form">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            ${rangeFields(range)}
            <div class="field"><label for="destination-project-${task.id}">Destination project</label>
              <select id="destination-project-${task.id}" name="destinationProject"${moveDisabled ? ' disabled' : ''}>
                ${eligibleDestinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
              </select></div>
            <button type="submit"${moveDisabled ? ' disabled' : ''}>Move task</button>
          </form>
        </article>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (req.method === 'GET' && url.pathname === '/styles.css') {
      send(res, 200, stylesheet, 'text/css; charset=utf-8');
    } else if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        send(res, 422, projectList('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      insertProject.run(name);
      redirect(res, '/');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const previous = dueRange(form);
      const from = (form.get('rangeFrom') || '').trim();
      const through = (form.get('rangeThrough') || '').trim();
      const error = !validDueDate(from) || !validDueDate(through)
        ? 'Due range must use valid YYYY-MM-DD dates'
        : from && through && from > through ? 'Due from must not be after Due through' : '';
      if (error) {
        send(res, 422, projectPage(project, filter, error, '', priority, previous));
        return;
      }
      redirect(res, projectLocation(project.id, filter, priority, { from, through }));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        send(res, 403, projectPage(project, filter, '', 'Archived project', priority, range));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        send(res, 422, projectPage(project, filter, '', 'Project name is required', priority, range));
        return;
      }
      renameProject.run(name, project.id);
      redirect(res, projectLocation(project.id, filter, priority, range));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/default-priority$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        send(res, 403, projectPage(project, filter, 'Archived project', '', priority, range));
        return;
      }
      const value = form.get('priority');
      if (!priorities.includes(value)) {
        send(res, 422, projectPage(project, filter, 'Choose a valid task priority', '', priority, range));
        return;
      }
      updateDefaultPriority.run(value, project.id);
      redirect(res, projectLocation(project.id, filter, priority, range));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const result = archiveProject.run(parts[3] === 'archive' ? 1 : 0, parts[2]);
      if (!result.changes) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      redirect(res, parts[3] === 'archive' ? '/' : '/?filter=Archived');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/(completion|rename|priority|due-date|move))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const project = findProject.get(parts[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const range = dueRange(form);
      if (project.archived) {
        send(res, 403, projectPage(project, filter, 'Archived project', '', priority, range));
        return;
      }
      if (parts[4]) {
        if (!findTask.get(parts[4], project.id)) {
          send(res, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
        if (parts[5] === 'move') {
          const destination = findProject.get(form.get('destinationProject') || '');
          if (!destination || destination.id === project.id || destination.archived) {
            send(res, 422, projectPage(project, filter, 'Choose an active destination project', '', priority, range));
            return;
          }
          moveTask.run(destination.id, destination.id, parts[4], project.id);
        } else if (parts[5] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            send(res, 422, projectPage(project, filter, 'Task title is required', '', priority, range));
            return;
          }
          renameTask.run(title, parts[4], project.id);
        } else if (parts[5] === 'priority') {
          const newPriority = form.get('priority');
          if (!priorities.includes(newPriority)) {
            send(res, 422, projectPage(project, filter, 'Choose a valid task priority', '', priority, range));
            return;
          }
          updateTaskPriority.run(newPriority, parts[4], project.id);
        } else if (parts[5] === 'due-date') {
          const dueDate = (form.get('dueDate') || '').trim();
          if (!validDueDate(dueDate)) {
            send(res, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', '', priority, range));
            return;
          }
          updateTaskDueDate.run(dueDate, parts[4], project.id);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, parts[4], project.id);
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          send(res, 422, projectPage(project, filter, 'Task title is required', '', priority, range));
          return;
        }
        insertTask.run(project.id, title, project.default_priority, project.id);
      }
      redirect(res, projectLocation(project.id, filter, priority, range));
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      send(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', priorityFilter(url.searchParams.get('priorityFilter')), dueRange(url.searchParams)));
    } else {
      send(res, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
    }
  } catch (error) {
    if (error.status === 413) {
      send(res, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!res.headersSent) send(res, 500, page('Server error', '<h1>Unable to complete your request</h1>'));
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
