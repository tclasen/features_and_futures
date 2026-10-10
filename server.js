import http from 'node:http';
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
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

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
    body { margin: 0; background: #f4f6fa; color: #182337; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 28px; font-size: 32px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #7b879a; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { cursor: pointer; border: 1px solid #224cb5; border-radius: 6px; padding: 10px 16px; background: #224cb5; color: white; font: inherit; font-weight: 600; }
    button:hover { background: #183b92; }
    button:disabled, input:disabled { cursor: not-allowed; opacity: .6; }
    :focus-visible { outline: 3px solid #e28b00; outline-offset: 3px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dce2ec; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .project-filter { margin-top: 28px; }
    [role="alert"] { color: #a32121; margin: 12px 0; }
    .empty { color: #586579; }
    .task-create { margin-top: 28px; }
    .task-filter { margin: 28px 0 16px; }
    select { padding: 8px 12px; font: inherit; border: 1px solid #7b879a; border-radius: 6px; }
    .task-row { padding: 16px 0; border-top: 1px solid #dce2ec; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-rename label { margin-bottom: 8px; }
    @media (max-width: 560px) { main { margin: 20px 12px; padding: 24px 18px; } .create-controls { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="project-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <div>
            <span class="project-name">${escapeHtml(project.name)}</span>
            <div data-testid="project-summary">${project.completed}/${project.total} completed</div>
          </div>
          <div class="project-actions">
            <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
            <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
          </div>
        </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </div>`);
}

function sendHtml(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null) {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="task-create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}${renameError ? ' aria-invalid="true" aria-describedby="rename-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
      ${renameError ? `<p id="rename-error" role="alert">${escapeHtml(renameError)}</p>` : ''}
    </form>
    <form class="task-create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
      ${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="tasks">
      ${tasks.length ? tasks.map(task => `
        <div class="task-row" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
            <input type="hidden" name="filter" value="${filter}">
            <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
          </form>
          <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
            <input type="hidden" name="filter" value="${filter}">
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="create-controls">
              <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}${taskRenameError?.id === task.id ? ` aria-invalid="true" aria-describedby="task-rename-error-${task.id}"` : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
            ${taskRenameError?.id === task.id ? `<p id="task-rename-error-${task.id}" role="alert">Task title is required</p>` : ''}
          </form>
        </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </div>`);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) return null;
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
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (archiveMatch && request.method === 'POST') {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        setProjectArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        redirect(response, archiveMatch[2] === 'restore' ? '/?filter=Archived' : '/');
        return;
      }
    }
    const projectMatch = /^\/projects\/([1-9]\d*)(?:\/(?:(tasks)(?:\/([1-9]\d*)\/(?:completion|rename))?|(rename)))?$/.exec(url.pathname);
    if (projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project && request.method === 'GET' && !projectMatch[2] && !projectMatch[4]) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      if (project && request.method === 'POST' && (projectMatch[2] || projectMatch[4])) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const currentProject = findProject.get(id);
        if (currentProject.archived) {
          sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project cannot be changed'));
          return;
        }
        if (projectMatch[4]) {
          const name = (form.get('name') || '').trim();
          if (!name) {
            sendHtml(response, 422, projectPage(currentProject, filter, '', 'Project name is required'));
            return;
          }
          renameProject.run(name, id);
        } else if (projectMatch[3]) {
          const taskId = Number(projectMatch[3]);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, project.id)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          if (url.pathname.endsWith('/rename')) {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 422, projectPage(currentProject, filter, '', '', { id: taskId }));
              return;
            }
            renameTask.run(title, taskId, project.id);
          } else {
            updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        }
        redirect(response, `/projects/${project.id}${filter === 'All' ? '' : `?filter=${filter}`}`);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Server error', '<h1>Something went wrong</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
