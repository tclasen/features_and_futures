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
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
`);
// Migrate databases created before project archiving was introduced.
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
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
  <title>${escapeHtml(title)} — Workboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/" method="get" class="filter-form">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <ul class="projects">${rows}</ul>`);
}

function projectPage(project, filter = 'All', error = '') {
  const rows = listTasks.all(project.id)
    .filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
    .map(task => `
      <li data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" value="1"
            aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''}
            onchange="this.form.requestSubmit()">
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="input-group">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </li>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <form action="/projects/${project.id}/rename" method="post" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="input-group">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="/projects/${project.id}/tasks" method="post" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="input-group">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects/${project.id}" method="get" class="filter-form">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <ul class="projects tasks">${rows}</ul>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(styles);
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectPage(project, filter, 'Project name is required'));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const [, , projectId, action] = url.pathname.split('/');
      const result = setProjectArchived.run(action === 'archive' ? 1 : 0, projectId);
      if (!result.changes) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = getProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/rename)?)?$/.test(url.pathname)) {
      const [, , projectId, , taskId, action] = url.pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project is read-only'));
        return;
      }
      if (taskId) {
        const title = (form.get('title') || '').trim();
        if (action === 'rename' && !title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
          return;
        }
        const result = action === 'rename'
          ? renameTask.run(title, taskId, project.id)
          : updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(project.id, title);
      }
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Unable to complete request'}</h1>`));
    } else {
      response.end();
    }
  }
});

const styles = `
  :root { font-family: system-ui, sans-serif; color: #172c40; background: #f3f6fa; }
  body { margin: 0; }
  main { max-width: 760px; margin: 60px auto; padding: 28px; }
  h1 { font-size: 2rem; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .input-group { display: flex; gap: 12px; flex-wrap: wrap; }
  input { flex: 1; min-width: 160px; padding: 12px; border: 1px solid #728396; border-radius: 6px; font: inherit; }
  .create-form, .filter-form { margin-top: 24px; }
  select { padding: 10px; font: inherit; border: 1px solid #728396; border-radius: 6px; }
  input[type="checkbox"] { min-width: 0; width: 22px; height: 22px; cursor: pointer; }
  button { background: #245bc0; color: white; border: 0; border-radius: 6px; padding: 12px 18px; font: inherit; cursor: pointer; }
  button:hover { background: #194799; }
  button:disabled { background: #728396; cursor: not-allowed; }
  input:disabled { cursor: not-allowed; }
  :focus-visible { outline: 3px solid #9a5000; outline-offset: 3px; }
  .projects { list-style: none; padding: 0; margin-top: 28px; }
  .projects li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; padding: 18px; background: white; border: 1px solid #d5deea; border-radius: 8px; margin-bottom: 12px; }
  .projects span { overflow-wrap: anywhere; min-width: 0; }
  .projects button { white-space: nowrap; }
  [role="alert"] { color: #a01919; font-weight: 600; }
  @media (max-width: 480px) { main { margin: 20px auto; padding: 16px; } }
`;

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
