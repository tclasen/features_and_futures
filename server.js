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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const setDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id ASC');
const addTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17233b; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; }
    h1 { font-size: 2rem; overflow-wrap: anywhere; }
    .panel, .project-row, .task-row { background: white; border: 1px solid #d9e0eb; border-radius: 10px; padding: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"], select { flex: 1; min-width: 180px; border: 1px solid #8794ab; border-radius: 6px; padding: 11px; font: inherit; }
    button { background: #2456b5; color: white; border: 0; border-radius: 6px; padding: 12px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194391; }
    button:disabled { background: #768194; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #e29116; outline-offset: 3px; }
    [role="alert"] { color: #a51a26; margin-top: 0; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex-shrink: 0; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-create, .task-filter { margin-top: 24px; }
    @media (max-width: 500px) { main { margin: 20px auto; padding: 16px; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function home(error = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <div class="project-row" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
    </div>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form class="panel" action="/projects" method="post">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <form class="task-filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function projectPage(project, filter = 'All', error = '', priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}"><input type="hidden" name="priorityFilter" value="${priority}">`;
  const rows = listTasks.all(project.id)
    .filter(task => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority))
    .map(task => `<div class="task-row" data-testid="task-row">
      <form action="/projects/${project.id}/tasks/${task.id}" method="post">
        ${filterFields}
        <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
        ${filterFields}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${['Low', 'Normal', 'High'].map(option => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
        ${filterFields}
        <label for="task-due-date-${task.id}">Task due date</label>
        <div class="controls"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
      </form>
      <form class="task-rename" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
        ${filterFields}
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="controls"><input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
    </div>`).join('');
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="panel task-create" action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="controls"><input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form class="panel task-create" action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="panel task-create" action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="controls"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Tasks">${rows}</section>`);
}

const taskFilter = value => ['Open', 'Completed'].includes(value) ? value : 'All';
const priorityFilter = value => ['Low', 'Normal', 'High'].includes(value) ? value : 'All';
const projectLocation = (id, filter, priority) => `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;

function validDueDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) return null;
  }
  return new URLSearchParams(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, home('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(res, 200, home('Project name is required'));
        return;
      }
      addProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (req.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(res, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) {
        html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    const defaultMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/default-priority$/);
    if (req.method === 'POST' && defaultMatch) {
      const project = getProject.get(defaultMatch[1]);
      if (project) {
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(res, 403, projectPage(project, filter, 'Archived project is read-only', priority));
          return;
        }
        const value = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(value)) {
          html(res, 400, projectPage(project, filter, 'Invalid task priority', priority));
          return;
        }
        setDefaultPriority.run(value, project.id);
        redirect(res, projectLocation(project.id, filter, priority));
        return;
      }
    }
    const renameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (req.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, 'All', 'Archived project is read-only'));
          return;
        }
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const name = (form.get('name') || '').trim();
        if (!name) {
          html(res, 200, projectPage(project, filter, 'Project name is required', priority));
          return;
        }
        renameProject.run(name, project.id);
        redirect(res, projectLocation(project.id, filter, priority));
        return;
      }
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(\/(?:rename|priority|due-date))?)?$/);
    if (req.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          html(res, 403, projectPage(project, 'All', 'Archived project is read-only'));
          return;
        }
        const form = await readForm(req);
        if (!form) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (taskMatch[3] === '/due-date') {
          if (!getTask.get(taskMatch[2], project.id)) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const dueDate = (form.get('dueDate') || '').trim();
          if (!validDueDate(dueDate)) {
            html(res, 200, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority));
            return;
          }
          setDueDate.run(dueDate, taskMatch[2], project.id);
        } else if (taskMatch[3] === '/priority') {
          const priority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(priority)) {
            html(res, 400, projectPage(project, filter, 'Invalid task priority', selectedPriority));
            return;
          }
          if (!setPriority.run(priority, taskMatch[2], project.id).changes) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else if (taskMatch[3] === '/rename') {
          if (!getTask.get(taskMatch[2], project.id)) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority));
            return;
          }
          renameTask.run(title, taskMatch[2], project.id);
        } else if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(res, 200, projectPage(project, filter, 'Task title is required', selectedPriority));
            return;
          }
          addTask.run(project.id, title, project.default_priority);
        }
        redirect(res, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    html(res, 404, page('Not found', '<h1>Not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
