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
)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f5f8; color: #182435; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    form { margin-bottom: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { padding: 10px; font: inherit; width: 100%; border: 1px solid #8994a4; border-radius: 6px; margin-bottom: 12px; }
    button { font: inherit; cursor: pointer; padding: 10px 16px; border: 0; border-radius: 6px; background: #245ac7; color: white; }
    select { font: inherit; padding: 8px; margin-bottom: 16px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid #dce1e8; overflow-wrap: anywhere; }
    .task-row[hidden] { display: none; }
    .task-row input { width: auto; margin: 0; flex-shrink: 0; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #bd7600; outline-offset: 3px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce1e8; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { margin: 0; flex-shrink: 0; }
    [role=alert] { color: #a51c22; margin-bottom: 16px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', name = '') {
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      <button type="submit">Create project</button>
    </form>
    <section aria-label="Projects">${listProjects.all().map(project => `
      <div class="project-row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('')}</section>`);
}

function projectPage(project, error = '') {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <div role="alert" id="task-error">${escapeHtml(error)}</div>
    <form action="/projects/${project.id}/tasks" method="post">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit">Create task</button>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option><option>Open</option><option>Completed</option>
    </select>
    <section aria-label="Tasks">${listTasks.all(project.id).map(task => `
      <div class="task-row" data-testid="task-row">
        <input type="checkbox" aria-label="${escapeHtml(`Complete ${task.title}`)}"
          data-completion-url="/projects/${project.id}/tasks/${task.id}/completion"${task.completed ? ' checked' : ''}>
        <span>${escapeHtml(task.title)}</span>
      </div>`).join('')}</section>
    <script>
      const filter = document.getElementById('task-filter');
      function applyFilter() {
        document.querySelectorAll('[data-testid="task-row"]').forEach(row => {
          const completed = row.querySelector('input').checked;
          row.hidden = filter.value === 'Open' && completed || filter.value === 'Completed' && !completed;
        });
      }
      filter.addEventListener('change', applyFilter);
      document.querySelectorAll('[data-completion-url]').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
          const completed = checkbox.checked;
          checkbox.disabled = true;
          document.getElementById('task-error').textContent = '';
          try {
            const response = await fetch(checkbox.dataset.completionUrl, {
              method: 'POST', body: new URLSearchParams({ completed: String(completed) })
            });
            if (!response.ok) throw new Error('Completion update failed');
          } catch {
            checkbox.checked = !completed;
            document.getElementById('task-error').textContent = 'Could not save task completion. Please try again.';
          } finally {
            checkbox.disabled = false;
            applyFilter();
          }
        });
      });
    </script>`);
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectsPage());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const name = ((await readForm(req)).get('name') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(Number(url.pathname.split('/')[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, projectPage(project));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/completion)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const project = findProject.get(Number(parts[2]));
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      if (parts.length === 4) {
        const title = (form.get('title') || '').trim();
        if (!title) {
          html(res, 422, projectPage(project, 'Task title is required'));
          return;
        }
        createTask.run(project.id, title);
        res.writeHead(303, { Location: `/projects/${project.id}` });
        res.end();
      } else {
        const completed = form.get('completed');
        if (completed !== 'true' && completed !== 'false') {
          html(res, 400, page('Invalid completion', '<h1>Invalid completion state</h1>'));
          return;
        }
        const result = updateTask.run(completed === 'true' ? 1 : 0, Number(parts[4]), project.id);
        res.writeHead(result.changes ? 204 : 404);
        res.end();
      }
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    if (error.status === 413) {
      html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
    } else {
      console.error(error);
      html(res, 500, page('Server error', '<h1>Server error</h1>'));
    }
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
