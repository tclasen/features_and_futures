import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
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
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #17263b; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 4px 24px #17263b0d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input[type="text"], select { width: 100%; padding: 12px; border: 1px solid #8491a4; border-radius: 6px; font: inherit; }
    button { padding: 11px 18px; border: 0; border-radius: 6px; background: #2156b5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #17428f; }
    :focus-visible { outline: 3px solid #d28c00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks, .filter { margin-top: 32px; }
    .task { padding: 18px 0; border-top: 1px solid #e1e6ed; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task input { flex-shrink: 0; width: 20px; height: 20px; }
    .back { margin-bottom: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #e1e6ed; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { background: #fff0ef; color: #a12216; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', name = '') {
  const rows = listProjects.all().map(project => `
    <div class="project" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function projectPage(project, filter = 'All', error = '') {
  const rows = listTasks.all(project.id)
    .filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
    .map(task => `
      <div class="task" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1"
            aria-label="${escapeHtml(`Complete ${task.title}`)}" ${task.completed ? 'checked' : ''}
            onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form class="back" action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit">Create task</button>
    </form>
    <form class="filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    <section class="tasks" aria-label="Tasks">${rows || '<p>No matching tasks.</p>'}</section>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectsPage());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      redirect(res, '/');
      return;
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*)\/completion)?)?$/.exec(url.pathname);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project && req.method === 'GET' && url.pathname === `/projects/${id}`) {
        sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
        return;
      }
      if (project && req.method === 'POST' && url.pathname.includes('/tasks')) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        if (match[2]) {
          const taskId = Number(match[2]);
          if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id).changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(res, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          createTask.run(id, title);
        }
        redirect(res, `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}`);
        return;
      }
    }
    sendHtml(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (error.status !== 413) console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, page('Error', error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>'));
    else res.end();
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
