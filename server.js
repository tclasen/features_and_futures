import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || resolve('data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
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
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

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
    :root { font-family: system-ui, sans-serif; color: #17243b; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 28px; overflow-wrap: anywhere; }
    .panel { background: white; border: 1px solid #dce2ec; border-radius: 12px; padding: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 10px; }
    .controls { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; border: 1px solid #8c9bb2; border-radius: 6px; padding: 11px; font: inherit; }
    button { background: #244fbc; color: white; border: 0; border-radius: 6px; padding: 12px 18px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193d98; }
    :focus-visible { outline: 3px solid #b87300; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .empty { color: #53617a; }
    .task-filter { margin-top: 24px; }
    select { padding: 10px; border: 1px solid #8c9bb2; border-radius: 6px; font: inherit; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input { flex: none; width: 20px; height: 20px; }
    .back { margin-bottom: 24px; }
    [role="alert"] { color: #a22222; margin: 16px 0 0; }
    @media (max-width: 480px) { main { margin-top: 32px; } .controls { flex-direction: column; } .panel { padding: 18px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="panel" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map(project => `
        <div class="panel project" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('')}
      ${projects.length ? '' : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form class="back" action="/" method="get"><button type="submit">Projects</button></form>
    <form class="panel" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="controls">
        <input id="task-title" name="title" type="text">
        <button type="submit">Create task</button>
      </div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Tasks">
      ${tasks.map(task => `
        <div class="panel task" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <label>
              <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
        </div>`).join('')}
      ${tasks.length ? '' : '<p class="empty">No tasks to show.</p>'}
    </section>`);
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
      sendHtml(response, 200, projectsPage());
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
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const projectMatch = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        if (taskMatch[2]) {
          const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
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
        redirect(response, `/projects/${project.id}?filter=${filter}`);
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Server error', '<h1>Unable to complete your request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
