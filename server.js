import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    :root { font-family: system-ui, sans-serif; color: #192b3e; background: #f4f6f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 12px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin: 32px 0 16px; }
    .intro, .empty { color: #536477; }
    .create { background: white; border: 1px solid #d9e1ea; border-radius: 12px; padding: 24px; margin-top: 28px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input[type="text"], select { min-width: 0; flex: 1; border: 1px solid #8394a8; border-radius: 6px; padding: 11px 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 18px; background: #225cc5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #174596; }
    :focus-visible { outline: 3px solid #b16a00; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px; background: white; border: 1px solid #d9e1ea; border-radius: 10px; }
    .name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .alert { color: #922525; margin: 0 0 16px; }
    .back { margin-bottom: 28px; }
    .filter { margin: 24px 0 16px; }
    .task { padding: 20px; background: white; border: 1px solid #d9e1ea; border-radius: 10px; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task input { width: 20px; height: 20px; flex-shrink: 0; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', name = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <p class="intro">A home for your projects.</p>
    <form class="create" method="post" action="/projects">
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="fields">
        <input id="project-name" name="name" type="text" value="${escapeHtml(name)}" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    <div class="projects">
      ${projects.length ? projects.map(project => `
        <div class="project" data-testid="project-row">
          <span class="name">${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </div>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="fields">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${tasks.length ? tasks.map(task => `
        <div class="task" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}><span>${escapeHtml(task.title)}</span></label>
          </form>
        </div>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </div>
    <p id="task-save-error" class="alert" role="alert" hidden></p>
    <script>
      let pendingUpdates = Promise.resolve();
      const taskFilter = document.getElementById('task-filter');
      const saveError = document.getElementById('task-save-error');
      document.querySelectorAll('input[name="completed"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          const completed = checkbox.checked;
          const form = checkbox.form;
          const body = new URLSearchParams({ completed: completed ? '1' : '0' });
          pendingUpdates = pendingUpdates.then(async () => {
            try {
              const response = await fetch(form.action, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body,
                keepalive: true,
              });
              if (!response.ok) throw new Error('Unable to save task');
              saveError.hidden = true;
              const filter = taskFilter.value;
              if (checkbox.checked === completed && filter !== 'All' && completed !== (filter === 'Completed')) {
                checkbox.closest('[data-testid="task-row"]').remove();
              }
            } catch (error) {
              if (checkbox.checked === completed) checkbox.checked = !completed;
              saveError.textContent = 'Unable to save task. Please try again.';
              saveError.hidden = false;
            }
          });
        });
      });
      taskFilter.addEventListener('change', async () => {
        await pendingUpdates;
        taskFilter.form.requestSubmit();
      });
    </script>`);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Form is too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
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
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (/^\/projects\/\d+(?:\/tasks(?:\/\d+)?)?$/.test(url.pathname) && ['GET', 'POST'].includes(request.method)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
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
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(project.id, title);
        } else {
          const taskId = Number(parts[4]);
          if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id).changes) {
            sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
            return;
          }
          if (request.headers.accept === 'application/json') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ completed: form.get('completed') === '1' }));
            return;
          }
        }
        response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
        response.end();
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
      }
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
    }
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete the request</h1>'));
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
