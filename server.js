import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || resolve('data/workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
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
const allProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const projectTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const stylesheet = readFileSync(new URL('./styles.css', import.meta.url));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = allProjects.all();
  return page('Projects', `
    <header><p class="eyebrow">Your workspace</p><h1>Workboard</h1>
      <p class="intro">A place for your projects.</p></header>
    <section aria-labelledby="create-heading" class="card">
      <h2 id="create-heading">Create a project</h2>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects" method="post" class="create-form">
        <div class="field"><label for="project-name">Project name</label>
          <input id="project-name" name="name" type="text" autocomplete="off"></div>
        <button type="submit">Create project</button>
      </form>
    </section>
    <section aria-labelledby="projects-heading" class="project-list">
      <h2 id="projects-heading">Projects</h2>
      ${projects.length ? projects.map((project) => `
        <article class="project-row" data-testid="project-row">
          <h3>${escapeHtml(project.name)}</h3>
          <form action="/projects/${project.id}" method="get">
            <button class="secondary" type="submit">Open project</button>
          </form>
        </article>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
}

function send(res, status, body, contentType = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

const taskFilter = (value) => ['Open', 'Completed'].includes(value) ? value : 'All';

function projectPage(project, filter = 'All', error = '') {
  const tasks = projectTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `
    <form action="/" method="get"><button class="secondary">Projects</button></form>
    <header class="detail"><p class="eyebrow">Project</p><h1>${escapeHtml(project.name)}</h1></header>
    <section class="card" aria-labelledby="create-heading">
      <h2 id="create-heading">Create a task</h2>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects/${project.id}/tasks" method="post" class="create-form">
        <input type="hidden" name="filter" value="${filter}">
        <div class="field"><label for="task-title">Task title</label>
          <input id="task-title" name="title" type="text" autocomplete="off"></div>
        <button type="submit">Create task</button>
      </form>
    </section>
    <section class="project-list" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <form action="/projects/${project.id}" method="get" class="filter-form">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${tasks.length ? tasks.map((task) => `
        <article class="task-row" data-testid="task-row">
          <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <label class="task-label"><input type="checkbox" name="completed" value="1"
              aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}
              onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
          </form>
        </article>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024 * 1024) {
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (req.method === 'GET' && url.pathname === '/styles.css') {
      send(res, 200, stylesheet, 'text/css; charset=utf-8');
    } else if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const name = ((await readForm(req)).get('name') || '').trim();
      if (!name) {
        send(res, 422, projectList('Project name is required'));
        return;
      }
      insertProject.run(name);
      redirect(res, '/');
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/completion)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const project = findProject.get(parts[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      if (parts[4]) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, parts[4], project.id);
        if (!result.changes) {
          send(res, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          send(res, 422, projectPage(project, filter, 'Task title is required'));
          return;
        }
        insertTask.run(project.id, title);
      }
      redirect(res, `/projects/${project.id}${filter === 'All' ? '' : `?filter=${filter}`}`);
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        send(res, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      send(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else {
      send(res, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
    }
  } catch (error) {
    if (error.status === 413) {
      send(res, 413, page('Request too large', '<h1>Request too large</h1>'));
      return;
    }
    console.error(error);
    if (!res.headersSent) send(res, 500, page('Server error', '<h1>Unable to complete your request</h1>'));
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
