import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)
`);
// Upgrade existing databases without changing project or task IDs.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))");
}
const taskPriorities = ['Low', 'Normal', 'High'];
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const updateDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const updateTaskTitle = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function taskFilterFields(filter, priority) {
  return `<input type="hidden" name="filter" value="${filter}">
    <input type="hidden" name="priorityFilter" value="${priority}">`;
}

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
    body { margin: 0; background: #f4f6fa; color: #192435; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 720px; margin: 48px auto; padding: 28px; background: white; border: 1px solid #dbe1ea; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input[type="checkbox"] { width: auto; }
    select { padding: 8px; font: inherit; }
    .task { padding: 16px 0; border-top: 1px solid #dbe1ea; overflow-wrap: anywhere; }
    .task label { display: inline; font-weight: normal; }
    .filter { margin: 24px 0; }
    input { width: 100%; padding: 10px; border: 1px solid #7c899b; border-radius: 5px; font: inherit; }
    button { padding: 10px 16px; background: #2158b5; color: white; border: 0; border-radius: 5px; font: inherit; cursor: pointer; }
    button:hover { background: #18438c; }
    button:disabled { background: #7c899b; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #e09a20; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 28px; }
    .project { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dbe1ea; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a11a20; }
    @media (max-width: 760px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(filter = 'Active', error = '') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <div class="project" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function projectPage(project, filter = 'All', priority = 'All', error = '') {
  const rows = listTasks.all(project.id)
    .filter(task => (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      && (priority === 'All' || task.priority === priority))
    .map(task => `
      <div class="task" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          ${taskFilterFields(filter, priority)}
          <input id="task-${task.id}" type="checkbox" name="completed" value="1"
            aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''}
            onchange="this.form.requestSubmit()">
          <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          ${taskFilterFields(filter, priority)}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''}
            onchange="this.form.requestSubmit()">
            ${taskPriorities.map(priority => `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          ${taskFilterFields(filter, priority)}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      ${taskFilterFields(filter, priority)}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="filter" action="/projects/${project.id}/default-task-priority" method="post">
      ${taskFilterFields(filter, priority)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}
        onchange="this.form.requestSubmit()">
        ${taskPriorities.map(option => `<option${option === project.default_task_priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      ${taskFilterFields(filter, priority)}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...taskPriorities].map(option => `<option${option === priority ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">${rows || '<p>No matching tasks.</p>'}</section>`);
}

function redirectToProject(response, projectId, filter, priority) {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  response.writeHead(303, { Location: `/projects/${projectId}?${query}` });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65536) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList(projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList(projectFilter(form.get('filter')), 'Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(pathname);
    if (request.method === 'POST' && archiveRoute) {
      const id = Number(archiveRoute[1]);
      if (Number.isSafeInteger(id) && updateProjectArchive.run(archiveRoute[2] === 'archive' ? 1 : 0, id).changes) {
        response.writeHead(303, { Location: archiveRoute[2] === 'archive' ? '/' : '/?filter=Archived' });
        response.end();
        return;
      }
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    const defaultPriorityRoute = /^\/projects\/([1-9]\d*)\/default-task-priority$/.exec(pathname);
    if (request.method === 'POST' && defaultPriorityRoute) {
      const id = Number(defaultPriorityRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, selectedPriority, 'Archived project cannot be changed'));
          return;
        }
        const priority = form.get('priority');
        if (!taskPriorities.includes(priority)) {
          sendHtml(response, 400, projectPage(project, filter, selectedPriority, 'Invalid task priority'));
          return;
        }
        updateDefaultTaskPriority.run(priority, id);
        redirectToProject(response, id, filter, selectedPriority);
        return;
      }
    }
    const renameRoute = /^\/projects\/([1-9]\d*)\/rename$/.exec(pathname);
    if (request.method === 'POST' && renameRoute) {
      const id = Number(renameRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, priority, 'Archived project cannot be changed'));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, priority, 'Project name is required'));
          return;
        }
        updateProjectName.run(name, id);
        redirectToProject(response, id, filter, priority);
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(?:\/(rename|priority))?)?$/.exec(pathname);
    if (request.method === 'POST' && taskRoute) {
      const projectId = Number(taskRoute[1]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (project) {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, selectedPriority, 'Archived project cannot be changed'));
          return;
        }
        const taskIdText = taskRoute[2];
        if (!taskIdText) {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, selectedPriority, 'Task title is required'));
            return;
          }
          insertTask.run(projectId, title, project.default_task_priority);
        } else {
          const taskId = Number(taskIdText);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, projectId)) {
            sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          if (taskRoute[3] === 'priority') {
            const priority = form.get('priority');
            if (!taskPriorities.includes(priority)) {
              sendHtml(response, 400, projectPage(project, filter, selectedPriority, 'Invalid task priority'));
              return;
            }
            updateTaskPriority.run(priority, taskId, projectId);
          } else if (taskRoute[3] === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, selectedPriority, 'Task title is required'));
              return;
            }
            updateTaskTitle.run(title, taskId, projectId);
          } else {
            updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
          }
        }
        redirectToProject(response, projectId, filter, selectedPriority);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
  } catch (error) {
    if (!error.status) console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
