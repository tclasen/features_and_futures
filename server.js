import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
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
CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
// Upgrade databases created before project archiving was introduced.
if (!db.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
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
    body { margin: 0; background: #f4f6fa; color: #1d2b40; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce3ed; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    select { font: inherit; padding: 8px; }
    .task-filter { margin-top: 24px; }
    input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    input { min-width: 0; flex: 1; padding: 10px; border: 1px solid #8b98aa; border-radius: 6px; font: inherit; }
    button { background: #224fc0; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; cursor: pointer; }
    button:hover { background: #193c94; }
    button:disabled { background: #8b98aa; cursor: not-allowed; }
    li { flex-wrap: wrap; }
    :focus-visible { outline: 3px solid #cf8b0c; outline-offset: 3px; }
    ul { padding: 0; list-style: none; margin: 28px 0 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce3ed; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a41d26; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #58667b; margin-top: 28px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul>${projects.map((project) => `
      <li data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-filter" action="/projects/${project.id}/rename" method="post">
      <label for="new-project-name">New project name</label>
      <input type="hidden" name="filter" value="${filter}">
      <div class="create-fields">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="/projects/${project.id}/tasks" method="post">
      <label for="task-title">Task title</label>
      <input type="hidden" name="filter" value="${filter}">
      <div class="create-fields">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul>${tasks.map((task) => `
      <li data-testid="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form class="task-completion" action="/projects/${project.id}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <form action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          <label for="new-task-title-${task.id}">New task title</label>
          <input type="hidden" name="filter" value="${filter}">
          <div class="create-fields">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No matching tasks.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1_000_000) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList('', searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectPage(project, filter, 'Project name is required'));
        return;
      }
      renameProject.run(name, project.id);
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(pathname)) {
      const [, , projectId, action] = pathname.split('/');
      if (!getProject.get(projectId)) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, projectId);
      response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
      const project = getProject.get(pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+(?:\/rename)?)?$/.test(pathname)) {
      const [, , projectId, , taskId, action] = pathname.split('/');
      const project = getProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project'));
        return;
      }
      if (taskId) {
        let result;
        if (action === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          result = renameTask.run(title, taskId, project.id);
        } else {
          result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        }
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
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
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
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
