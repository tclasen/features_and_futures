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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
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
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function projectLocation(id, filter, priority) {
  return `/projects/${id}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}`;
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
    body { margin: 0; background: #f5f7fb; color: #182335; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    form.create { padding: 24px; background: white; border: 1px solid #d9e0eb; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input[type="text"], select { width: 100%; padding: 12px; border: 1px solid #8b98ac; border-radius: 6px; font: inherit; margin-bottom: 16px; }
    button { font: inherit; cursor: pointer; background: #244fc4; color: white; border: 0; border-radius: 6px; padding: 10px 16px; }
    button:hover { background: #193b98; }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.55; }
    li { flex-wrap: wrap; }
    .filter { margin-top: 24px; }
    input[type="checkbox"] { width: 22px; height: 22px; margin: 0; cursor: pointer; }
    :focus-visible { outline: 3px solid #aa6800; outline-offset: 3px; }
    ul { list-style: none; padding: 0; }
    li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px; margin-top: 12px; background: white; border: 1px solid #d9e0eb; border-radius: 8px; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #9b1c1c; font-weight: 600; }
    @media (max-width: 500px) { main { margin: 20px auto; padding: 16px; } li { align-items: start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <li data-testid="project-row"><span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </li>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <h2>Projects</h2>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${rows ? `<ul>${rows}</ul>` : '<p>No projects yet.</p>'}`);
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null, priority = 'All') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}"><input type="hidden" name="priorityFilter" value="${priority}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  const rows = tasks.map(task => `<li data-testid="task-row">
    <span>${escapeHtml(task.title)}</span>
    <form action="/projects/${project.id}/tasks/${task.id}" method="post">
      ${filterFields}
      <input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()">
    </form>
    <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
      ${filterFields}
      <label for="task-priority-${task.id}">Task priority</label>
      <select id="task-priority-${task.id}" name="priority" onchange="this.form.requestSubmit()"${project.archived ? ' disabled' : ''}>
        ${['Low', 'Normal', 'High'].map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
      ${filterFields}
      <label for="new-task-title-${task.id}">New task title</label>
      <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
      ${taskRenameError?.id === task.id ? `<p role="alert">${escapeHtml(taskRenameError.message)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
    </form>
  </li>`).join('');
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" action="/projects/${project.id}/default-priority" method="post">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority" onchange="this.form.requestSubmit()"${project.archived ? ' disabled' : ''}>
        ${['Low', 'Normal', 'High'].map(option => `<option${option === project.default_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <h2>Tasks</h2>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
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
    ${rows ? `<ul>${rows}</ul>` : '<p>No matching tasks.</p>'}`);
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
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        html(response, 400, projectList('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, '', 'Archived project is read-only', null, selectedPriority));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          html(response, 400, projectPage(project, filter, '', 'Project name is required', null, selectedPriority));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        redirect(response, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
        return;
      }
    }
    const defaultPriorityMatch = /^\/projects\/(\d+)\/default-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const project = findProject.get(defaultPriorityMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project is read-only', '', null, selectedPriority));
          return;
        }
        const priority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', null, selectedPriority));
          return;
        }
        setDefaultPriority.run(priority, project.id);
        redirect(response, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    const priorityMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/priority$/.exec(url.pathname);
    if (request.method === 'POST' && priorityMatch) {
      const project = findProject.get(priorityMatch[1]);
      const task = project && findTask.get(priorityMatch[2], project.id);
      if (task) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project is read-only', '', null, selectedPriority));
          return;
        }
        const priority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          html(response, 400, projectPage(project, filter, 'Invalid task priority', '', null, selectedPriority));
          return;
        }
        setTaskPriority.run(priority, task.id, project.id);
        redirect(response, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    const taskRenameMatch = /^\/projects\/(\d+)\/tasks\/(\d+)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && taskRenameMatch) {
      const project = findProject.get(taskRenameMatch[1]);
      const task = project && findTask.get(taskRenameMatch[2], project.id);
      if (task) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project is read-only', '', null, selectedPriority));
          return;
        }
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(response, 400, projectPage(project, filter, '', '', {
            id: task.id, message: 'Task title is required'
          }, selectedPriority));
          return;
        }
        renameTask.run(title, task.id, project.id);
        redirect(response, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project is read-only', '', null, selectedPriority));
          return;
        }
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            html(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            html(response, 400, projectPage(project, filter, 'Task title is required', '', null, selectedPriority));
            return;
          }
          createTask.run(project.id, title, project.default_priority);
        }
        redirect(response, projectLocation(project.id, filter, selectedPriority));
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', null, priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    html(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (error.status === 413) {
      html(response, 413, page('Request too large', '<h1>Request too large</h1>'));
    } else {
      console.error(error);
      html(response, 500, page('Server error', '<h1>Server error</h1>'));
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
