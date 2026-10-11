import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = db.prepare(`SELECT projects.id, projects.name,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const findProject = db.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultTaskPriority = db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
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
    body { margin: 0; background: #f5f7fa; color: #17243b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 2.5rem; line-height: 1.2; overflow-wrap: anywhere; }
    h2 { margin-top: 40px; font-size: 1.25rem; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    input[type="text"], select { flex: 1; min-width: 180px; padding: 12px; border: 1px solid #8491a6; border-radius: 6px; font: inherit; }
    .task-completion { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; min-width: 0; }
    .task-completion input { width: 20px; height: 20px; flex-shrink: 0; }
    li .task-form { flex-shrink: 1; min-width: 0; }
    .filter { margin-top: 24px; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #254bd1; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #183aaa; }
    button:disabled { background: #8491a6; cursor: default; }
    .project-details { flex: 1; min-width: 0; }
    .project-details span { display: block; }
    :focus-visible { outline: 3px solid #c77b00; outline-offset: 3px; }
    ul { list-style: none; padding: 0; }
    li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin: 12px 0; padding: 20px; border: 1px solid #d9dfeb; border-radius: 8px; background: white; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { padding: 12px 16px; border-left: 4px solid #b42318; background: #feeceb; color: #8a1c13; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const archived = filter === 'Archived';
  const projects = listProjects.all(archived ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul>${projects.map(project => `
      <li data-testid="project-row"><div class="project-details"><span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span></div>
        <form method="get" action="/projects/${project.id}">
          <button type="submit">Open project</button>
        </form>
        <form method="post" action="/projects/${project.id}/${archived ? 'restore' : 'archive'}">
          <button type="submit">${archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>` : '<p>Your projects will appear here.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function projectLocation(id, filter, priority) {
  const query = new URLSearchParams();
  if (filter !== 'All') query.set('filter', filter);
  if (priority !== 'All') query.set('priorityFilter', priority);
  return `/projects/${id}${query.size ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', priority = 'All', error = '') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
        <input type="hidden" name="priorityFilter" value="${priority}">`;
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Rename project</h2>
    <form method="post" action="/projects/${project.id}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="create"><input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <h2>Tasks</h2>
    <form method="post" action="/projects/${project.id}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map(option => `<option${option === project.default_task_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form method="post" action="/projects/${project.id}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `<li data-testid="task-row">
      <form class="task-form" method="post" action="/projects/${project.id}/tasks/${task.id}">
        ${filterFields}
        <label class="task-completion"><input type="checkbox" name="completed" value="1"
          aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
          ${project.archived ? 'disabled' : ''}
          onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
      <form class="task-form" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
        ${filterFields}
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="create"><input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
      <form class="task-form" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
        ${filterFields}
        <label for="task-priority-${task.id}">Task priority</label>
        <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
          ${taskPriorities.map(option => `<option${option === task.priority ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
    </li>`).join('')}</ul>` : '<p>No tasks to show.</p>'}`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
    } else if (/^\/projects\/\d+(?:\/tasks(?:\/\d+(?:\/(?:rename|priority))?)?|\/archive|\/restore|\/rename|\/default-priority)?$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const parts = url.pathname.split('/');
      if (request.method === 'GET' && parts.length === 3) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter'))));
      } else if (request.method === 'POST' && parts.length === 4 && ['archive', 'restore'].includes(parts[3])) {
        const archived = parts[3] === 'archive';
        setProjectArchived.run(archived ? 1 : 0, project.id);
        redirect(response, archived ? '/' : '/?filter=Archived');
      } else if (request.method === 'POST' && parts.length === 4 && parts[3] === 'default-priority') {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        const defaultPriority = form.get('priority');
        if (!taskPriorities.includes(defaultPriority)) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Task priority is invalid'));
          return;
        }
        setDefaultTaskPriority.run(defaultPriority, project.id);
        redirect(response, projectLocation(project.id, filter, priority));
      } else if (request.method === 'POST' && parts.length === 4 && parts[3] === 'rename') {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Project name is required'));
          return;
        }
        renameProject.run(name, project.id);
        redirect(response, projectLocation(project.id, filter, priority));
      } else if (request.method === 'POST' && parts[3] === 'tasks') {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project is read-only'));
          return;
        }
        if (parts.length === 4) {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title, project.default_task_priority);
        } else {
          const taskId = Number(parts[4]);
          let result;
          if (parts[5] === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Task title is required'));
              return;
            }
            if (Number.isSafeInteger(taskId)) result = renameTask.run(title, taskId, project.id);
          } else if (parts[5] === 'priority') {
            const taskPriority = form.get('priority');
            if (!taskPriorities.includes(taskPriority)) {
              sendHtml(response, 400, projectPage(project, filter, priority, 'Task priority is invalid'));
              return;
            }
            if (Number.isSafeInteger(taskId)) result = setTaskPriority.run(taskPriority, taskId, project.id);
          } else if (Number.isSafeInteger(taskId)) {
            result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
          }
          if (!result?.changes) {
            sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, projectLocation(project.id, filter, priority));
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
      }
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
