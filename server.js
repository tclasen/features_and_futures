import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = resolve(process.env.DB_PATH ?? 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; }
    main { width: min(44rem, calc(100% - 2rem)); margin: 3rem auto; }
    h1 { margin-bottom: 1.5rem; }
    form, [data-testid="project-row"] { display: flex; align-items: center; gap: .75rem; }
    form { flex-wrap: wrap; margin-bottom: 1rem; }
    label { width: 100%; font-weight: 600; }
    input { flex: 1; min-width: 12rem; padding: .65rem; border: 1px solid #9aa5b8; border-radius: .35rem; font: inherit; }
    button { padding: .65rem 1rem; border: 0; border-radius: .35rem; background: #2457c5; color: white; font: inherit; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #8ab4ff; outline-offset: 2px; }
    [data-testid="project-row"] { justify-content: space-between; padding: 1rem; margin: .5rem 0; background: white; border: 1px solid #dce2ec; border-radius: .4rem; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .75rem; padding: 1rem; margin: .5rem 0; background: white; border: 1px solid #dce2ec; border-radius: .4rem; }
    [data-testid="task-row"][hidden] { display: none; }
    [data-testid="task-row"] input { flex: initial; min-width: auto; }
    select { padding: .65rem; border: 1px solid #9aa5b8; border-radius: .35rem; font: inherit; }
    [role="alert"] { color: #a22020; min-height: 1.5em; }
  </style>
</head>
<body>
  <main id="app">__INITIAL_CONTENT__</main>
  <script>
  (() => {
    const form = document.querySelector('#project-form');
    if (!form) return;
    const input = form.querySelector('#project-name');
    const alert = document.querySelector('[role="alert"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        alert.textContent = 'Project name is required';
        return;
      }
      alert.textContent = '';
      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error('Project creation failed');
        // Newly created projects are active, so return to the default list view.
        window.location.assign('/');
      } catch {
        alert.textContent = 'Unable to create project';
      }
    });
  })();
  (() => {
    const filter = document.querySelector('#project-filter');
    if (!filter) return;
    filter.addEventListener('change', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('filter', filter.value);
      window.location.assign(url);
    });
    document.querySelectorAll('[data-project-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = button.closest('[data-testid="project-row"]');
        try {
          const response = await fetch('/api/projects/' + row.dataset.projectId + '/archive', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: button.dataset.projectAction === 'archive' })
          });
          if (!response.ok) throw new Error('Project update failed');
          // Show the project in the list matching its new archive state.
          window.location.assign(button.dataset.projectAction === 'archive' ? '/?filter=Archived' : '/');
        } catch { document.querySelector('[role="alert"]').textContent = 'Unable to update project'; }
      });
    });
  })();
  (() => {
    const form = document.querySelector('#task-form');
    if (!form) return;
    const input = form.querySelector('#task-title');
    const alert = document.querySelector('[role="alert"]');
    const projectId = form.dataset.projectId;
    const filter = document.querySelector('#task-filter');
    const applyFilter = () => {
      for (const row of document.querySelectorAll('[data-testid="task-row"]')) {
        const completed = row.querySelector('input[type="checkbox"]').checked;
        row.hidden = filter.value === 'Open' ? completed : filter.value === 'Completed' ? !completed : false;
      }
    };
    filter.addEventListener('change', applyFilter);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { alert.textContent = 'Task title is required'; return; }
      alert.textContent = '';
      try {
        const response = await fetch('/api/projects/' + projectId + '/tasks', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (!response.ok) throw new Error('Task creation failed');
        window.location.reload();
      } catch { alert.textContent = 'Unable to create task'; }
    });
    document.querySelectorAll('[data-testid="task-row"] input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', async () => {
        const row = checkbox.closest('[data-testid="task-row"]');
        try {
          const response = await fetch('/api/projects/' + projectId + '/tasks/' + row.dataset.taskId, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          if (!response.ok) throw new Error('Task update failed');
          applyFilter();
        } catch {
          checkbox.checked = !checkbox.checked;
          alert.textContent = 'Unable to update task';
        }
      });
    });
    applyFilter();
  })();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderPage(pathname, search = '') {
  let content;
  if (pathname === '/') {
    const archivedView = new URLSearchParams(search).get('filter')?.toLowerCase() === 'archived';
    const rows = listProjects.all().filter((project) => Boolean(project.archived) === archivedView).map((project) => `
      <section data-testid="project-row" data-project-id="${project.id}"><span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <button type="button" onclick="window.location.href='/projects/${project.id}'">Open project</button>
        ${project.archived ? '<button type="button" data-project-action="restore">Restore project</button>' : '<button type="button" data-project-action="archive">Archive project</button>'}
      </section>`).join('');
    content = `<h1>Workboard</h1>
      <label for="project-filter">Project filter</label><select id="project-filter"><option value="Active"${archivedView ? '' : ' selected'}>Active</option><option value="Archived"${archivedView ? ' selected' : ''}>Archived</option></select>
      <form id="project-form"><label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text"><button type="submit">Create project</button>
      </form><p role="alert" aria-live="polite"></p>${rows}`;
  } else {
    const id = Number(pathname.match(/^\/projects\/(\d+)\/?$/)[1]);
    const project = getProject.get(id);
    if (project) {
      const rows = listTasks.all(id).map((task) => `
        <section data-testid="task-row" data-task-id="${task.id}">
          <input type="checkbox" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
          <span>${escapeHtml(task.title)}</span>
        </section>`).join('');
      content = `<h1>${escapeHtml(project.name)}</h1><button type="button" onclick="window.location.href='/'">Projects</button>
        ${project.archived ? '<p>Archived project</p>' : ''}
        <form id="task-form" data-project-id="${project.id}"><label for="task-title">Task title</label>
          <input id="task-title" name="title" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
        </form><p role="alert" aria-live="polite"></p>
        <label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select>${rows}`;
    } else {
      content = '<h1>Project not found</h1><button type="button" onclick="window.location.href=\'/\'">Projects</button>';
    }
  }
  return page.replace('__INITIAL_CONTENT__', content);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all().filter((project) => !project.archived));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const input = await readJson(request);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (request.method === 'POST' && taskCollectionMatch) {
    try {
      const projectId = Number(taskCollectionMatch[1]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot receive tasks' }); return; }
      const input = await readJson(request);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const result = createTask.run(projectId, title);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), project_id: projectId, title, completed: 0 });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    try {
      const project = getProject.get(Number(taskMatch[1]));
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot update tasks' }); return; }
      const input = await readJson(request);
      if (typeof input.completed !== 'boolean') { sendJson(response, 400, { error: 'Invalid completion state' }); return; }
      const result = updateTask.run(input.completed ? 1 : 0, Number(taskMatch[2]), Number(taskMatch[1]));
      if (result.changes === 0) { sendJson(response, 404, { error: 'Task not found' }); return; }
      sendJson(response, 200, { id: Number(taskMatch[2]), completed: input.completed ? 1 : 0 });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const projectId = Number(archiveMatch[1]);
      const input = await readJson(request);
      if (typeof input.archived !== 'boolean') { sendJson(response, 400, { error: 'Invalid archive state' }); return; }
      const result = setProjectArchived.run(input.archived ? 1 : 0, projectId);
      if (result.changes === 0) { sendJson(response, 404, { error: 'Project not found' }); return; }
      sendJson(response, 200, { id: projectId, archived: input.archived ? 1 : 0 });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(renderPage(url.pathname, url.search));
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
