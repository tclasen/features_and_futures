import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
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

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f5f7fa; color: #182333; margin: 0; }
    main { max-width: 720px; margin: 48px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input, select, button { font: inherit; padding: 10px 14px; border-radius: 6px; }
    input { border: 1px solid #718096; max-width: 100%; box-sizing: border-box; }
    button { border: 1px solid #234a91; background: #234a91; color: white; cursor: pointer; }
    button:hover { background: #16386f; }
    :focus-visible { outline: 3px solid #c47500; outline-offset: 3px; }
    .project-row, .task-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; background: white; border: 1px solid #cbd3df; border-radius: 8px; margin: 12px 0; }
    .project-name, .task-row label { overflow-wrap: anywhere; min-width: 0; }
    .task-row label { margin: 0; }
    .task-filter { margin-top: 24px; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a01c25; }
    .create-controls { display: flex; gap: 8px; flex-wrap: wrap; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <section aria-label="Projects">
      ${projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('')}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(project.id)
    .filter((task) => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects/${project.id}/tasks">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text">
        <input type="hidden" name="filter" value="${filter}">
        <button type="submit">Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map((task) => `
        <div class="task-row" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}">
            <input type="hidden" name="filter" value="${filter}">
            <input id="task-${task.id}" type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}>
            <label for="task-${task.id}">${escapeHtml(task.title)}</label>
          </form>
        </div>`).join('')}
    </section>
    <script>
      const pendingUpdates = new Set();
      const filterControl = document.getElementById('task-filter');
      filterControl.addEventListener('change', async () => {
        await Promise.all(pendingUpdates);
        filterControl.form.requestSubmit();
      });
      for (const checkbox of document.querySelectorAll('.task-row input[type="checkbox"]')) {
        checkbox.addEventListener('change', () => {
          const completed = checkbox.checked;
          // Keep the current document in place: a redirect can restore an old
          // checked value while the user is already interacting with the next row.
          checkbox.disabled = true;
          const body = new URLSearchParams(new FormData(checkbox.form));
          body.set('completed', completed ? '1' : '0');
          const update = (async () => {
            try {
              const response = await fetch(checkbox.form.action, {
                method: 'POST', body, headers: { Accept: 'application/json' }, keepalive: true,
              });
              if (!response.ok) throw new Error('Task update failed');
              await response.json();
              if (filterControl.value !== 'All' && completed !== (filterControl.value === 'Completed')) {
                checkbox.closest('.task-row').remove();
              }
            } catch (error) {
              checkbox.checked = !completed;
              const alert = document.createElement('p');
              alert.setAttribute('role', 'alert');
              alert.textContent = 'Unable to save task completion. Please try again.';
              checkbox.form.before(alert);
            } finally {
              checkbox.disabled = false;
            }
          })();
          pendingUpdates.add(update);
          update.finally(() => pendingUpdates.delete(update));
        });
      }
    </script>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

async function readForm(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    bytes += chunk.length;
    if (bytes > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectList('Project name is required'));
        return;
      }
      db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if ((req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) ||
      (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname))) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id)
        ? db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
        : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      if (req.method === 'GET') {
        sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      const taskId = url.pathname.split('/')[4];
      if (taskId) {
        const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
          .run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          sendHtml(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
        if (req.headers.accept === 'application/json') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ completed: form.get('completed') === '1' }));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(res, 200, projectPage(project, filter, 'Task title is required'));
          return;
        }
        db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(project.id, title);
      }
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      res.end();
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendHtml(res, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    } else {
      res.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
