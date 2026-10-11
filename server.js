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
  name TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
    :focus-visible { outline: 3px solid #c77b00; outline-offset: 3px; }
    ul { list-style: none; padding: 0; }
    li { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 12px 0; padding: 20px; border: 1px solid #d9dfeb; border-radius: 8px; background: white; }
    li span { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { padding: 12px 16px; border-left: 4px solid #b42318; background: #feeceb; color: #8a1c13; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    ${projects.length ? `<ul>${projects.map(project => `
      <li data-testid="project-row"><span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}">
          <button type="submit">Open project</button>
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

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h2>Tasks</h2>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="create"><input id="task-title" name="title" type="text">
        <button type="submit">Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `<li data-testid="task-row">
      <form class="task-form" method="post" action="/projects/${project.id}/tasks/${task.id}">
        <input type="hidden" name="filter" value="${filter}">
        <label class="task-completion"><input type="checkbox" name="completed" value="1"
          aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
          onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
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
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const name = ((await readForm(request)).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
    } else if (/^\/projects\/\d+(?:\/tasks(?:\/\d+)?)?$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const parts = url.pathname.split('/');
      if (request.method === 'GET' && parts.length === 3) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
      } else if (request.method === 'POST' && parts[3] === 'tasks') {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (parts.length === 4) {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        } else {
          const taskId = Number(parts[4]);
          if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id).changes) {
            sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, `/projects/${project.id}${filter === 'All' ? '' : `?filter=${filter}`}`);
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
