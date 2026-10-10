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
)`);
// Migrate databases created before project archiving was introduced.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks receive the same default as newly created tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults affect only tasks created after the selection changes.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');

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
    body { margin: 0; background: #f5f7fb; color: #17243a; font: 17px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 3px 18px #17243a12; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input[type="checkbox"] { width: auto; }
    select { padding: 10px; font: inherit; }
    .task-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; border-top: 1px solid #dce2ec; padding: 18px 0; overflow-wrap: anywhere; }
    .task-row label { margin: 0; }
    .filter { margin: 24px 0; }
    input { padding: 11px; border: 1px solid #8895a7; border-radius: 5px; font: inherit; width: 100%; }
    button { padding: 11px 16px; border: 0; border-radius: 5px; background: #2457b8; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #183e86; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .project-row { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #e69b25; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce2ec; padding: 18px 0; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row button { white-space: nowrap; }
    .projects { margin-top: 30px; }
    [role="alert"] { color: #a12424; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', value = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <div class="project-row" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" value="${escapeHtml(value)}" autocomplete="off">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function projectLocation(id, filter, priority) {
  return `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null, priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">`;
  const rows = listTasks.all(project.id)
    .filter(task => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority))
    .map(task => `
      <div class="task-row" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          ${filterFields}
          <input id="task-${task.id}" type="checkbox" name="completed" value="1"
            aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''}
            ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${filterFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${filterFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          ${taskRenameError?.id === task.id ? `<p role="alert">${escapeHtml(taskRenameError.message)}</p>` : ''}
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form class="create" action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" autocomplete="off">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">${rows}</section>`);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = new URLSearchParams(await readBody(request));
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required', '', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (project) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, '', 'Archived project is read-only', null, priorityFilter(form.get('priorityFilter'))));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, '', 'Project name is required', null, priorityFilter(form.get('priorityFilter'))));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))));
        return;
      }
    }
    const defaultPriorityMatch = /^\/projects\/([1-9]\d*)\/default-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const project = getProject.get(defaultPriorityMatch[1]);
      if (project) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        const priority = form.get('priority');
        if (project.archived || !['Low', 'Normal', 'High'].includes(priority)) {
          sendHtml(response, project.archived ? 403 : 400, projectPage(project, filter,
            project.archived ? 'Archived project is read-only' : 'Invalid task priority', '', null, priorityFilter(form.get('priorityFilter'))));
          return;
        }
        setDefaultPriority.run(priority, project.id);
        redirect(response, projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))));
        return;
      }
    }
    const taskPriorityMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/priority$/.exec(url.pathname);
    if (request.method === 'POST' && taskPriorityMatch) {
      const project = getProject.get(taskPriorityMatch[1]);
      const task = project && getTask.get(taskPriorityMatch[2], project.id);
      if (task) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        const priority = form.get('priority');
        if (project.archived || !['Low', 'Normal', 'High'].includes(priority)) {
          sendHtml(response, project.archived ? 403 : 400, projectPage(project, filter,
            project.archived ? 'Archived project is read-only' : 'Invalid task priority', '', null, priorityFilter(form.get('priorityFilter'))));
          return;
        }
        setTaskPriority.run(priority, task.id, project.id);
        redirect(response, projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))));
        return;
      }
    }
    const taskRenameMatch = /^\/projects\/([1-9]\d*)\/tasks\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && taskRenameMatch) {
      const project = getProject.get(taskRenameMatch[1]);
      const task = project && getTask.get(taskRenameMatch[2], project.id);
      if (task) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        const title = (form.get('title') || '').trim();
        if (project.archived || !title) {
          sendHtml(response, project.archived ? 403 : 400, projectPage(project, filter, '', '', {
            id: task.id,
            message: project.archived ? 'Archived project is read-only' : 'Task title is required',
          }, priorityFilter(form.get('priorityFilter'))));
          return;
        }
        renameTask.run(title, task.id, project.id);
        redirect(response, projectLocation(project.id, filter, priorityFilter(form.get('priorityFilter'))));
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (project) {
        const form = new URLSearchParams(await readBody(request));
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only', '', null, priority));
          return;
        }
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', '', null, priority));
            return;
          }
          createTask.run(project.id, title, project.default_priority);
        }
        redirect(response, projectLocation(project.id, filter, priority));
        return;
      }
    }
    const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', null,
          priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
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
