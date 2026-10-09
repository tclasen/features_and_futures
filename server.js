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
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17253a; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 24px; overflow-wrap: anywhere; }
    h2 { font-size: 22px; margin-top: 36px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input:not([type="checkbox"]), select { width: 100%; font: inherit; padding: 12px; border: 1px solid #8591a3; border-radius: 6px; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    button { font: inherit; font-weight: 600; padding: 10px 16px; border: 0; border-radius: 6px; background: #2457c5; color: white; cursor: pointer; }
    button:hover { background: #1c4398; }
    :focus-visible { outline: 3px solid #b35a00; outline-offset: 3px; }
    .create { padding: 24px; background: white; border: 1px solid #d8dfe9; border-radius: 10px; }
    .create button { margin-top: 16px; }
    .task-create, .filter { margin-top: 24px; }
    .task-row { padding: 16px 20px; margin-bottom: 12px; background: white; border: 1px solid #d8dfe9; border-radius: 10px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row span { min-width: 0; }
    .project-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px; margin-bottom: 12px; background: white; border: 1px solid #d8dfe9; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #9b1c1c; font-weight: 600; }
    @media (max-width: 480px) { main { margin-top: 32px; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', enteredName = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" value="${escapeHtml(enteredName)}"${error ? ' aria-invalid="true" aria-describedby="name-error"' : ''}>
      ${error ? `<p id="name-error" role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <h2>Projects</h2>
    ${projects.length ? projects.map(project => `
      <div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}">
          <button type="submit">Open project</button>
        </form>
      </div>`).join('') : '<p>No projects yet. Create your first project above.</p>'}
  `);
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '', enteredTitle = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create task-create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" value="${escapeHtml(enteredTitle)}"${error ? ' aria-invalid="true" aria-describedby="title-error"' : ''}>
      ${error ? `<p id="title-error" role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create task</button>
    </form>
    <h2>Tasks</h2>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? tasks.map(task => `
      <div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label>
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="saveTaskCompletion(this)">
            <span>${escapeHtml(task.title)}</span>
          </label>
        </form>
      </div>`).join('') : '<p>No matching tasks.</p>'}
    <p id="completion-error" role="alert" hidden></p>
    <script>
      function saveTaskCompletion(checkbox) {
        const error = document.getElementById('completion-error');
        error.hidden = true;
        try {
          const request = new XMLHttpRequest();
          // Finish this small save before returning from the change event so an
          // immediate reload cannot cancel it or read the previous saved state.
          request.open('POST', checkbox.form.action, false);
          request.setRequestHeader('Accept', 'application/json');
          request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          request.send(new URLSearchParams(new FormData(checkbox.form)).toString());
          if (request.status !== 200) throw new Error('Completion save failed');
          if (checkbox.form.elements.filter.value !== 'All') window.location.reload();
        } catch {
          checkbox.checked = !checkbox.checked;
          error.textContent = 'Could not save task completion. Please try again.';
          error.hidden = false;
        }
      }
    </script>
  `);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) {
      const error = new Error('Form is too large');
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
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const name = enteredName.trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', enteredName));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if ((request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) ||
      (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname))) {
      const project = getProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      if (request.method === 'GET') {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const taskId = url.pathname.split('/')[4];
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, Number(taskId), project.id);
        if (!result.changes) {
          sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
        if (request.headers.accept === 'application/json') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ completed: form.get('completed') === '1' }));
          return;
        }
      } else {
        const enteredTitle = form.get('title') || '';
        const title = enteredTitle.trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required', enteredTitle));
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
    sendHtml(response, error.status || 500, page('Request failed', '<h1>Request failed</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
