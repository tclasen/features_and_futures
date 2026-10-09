import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function taskFilter(url) {
  const filter = url.searchParams.get('filter');
  return ['Open', 'Completed'].includes(filter) ? filter : 'All';
}

function projectFilter(url) {
  return url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active';
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
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
    body { margin: 0; background: #f4f6fa; color: #182339; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dbe1ec; border-radius: 16px; }
    h1 { margin: 0 0 24px; font-size: 32px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin-top: 32px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #8794a9; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 1px solid #244cc0; border-radius: 6px; background: #244cc0; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193b9c; }
    button:disabled { background: #778197; border-color: #778197; cursor: default; }
    :focus-visible { outline: 3px solid #e3a42e; outline-offset: 3px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-bottom: 1px solid #dbe1ec; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .project-summary { color: #53627a; font-size: 14px; }
    [role="alert"] { padding: 12px; margin-bottom: 16px; background: #fff0ef; color: #9b201b; border-radius: 6px; }
    .empty { color: #53627a; }
    select { padding: 10px; font: inherit; border: 1px solid #8794a9; border-radius: 6px; }
    .task-row { padding: 16px 0; border-bottom: 1px solid #dbe1ec; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-row input[type="checkbox"]:checked + span { text-decoration: line-through; color: #53627a; }
    .task-rename { margin-top: 12px; }
    .task-rename label { margin-bottom: 8px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(filter = 'Active', error = '') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/projects?filter=${filter}">
      <label for="project-name">Project name</label>
      <div class="create-fields"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
      <div><span class="project-name">${escapeHtml(project.name)}</span>
        <div class="project-summary" data-testid="project-summary">${project.completed}/${project.total} completed</div></div>
      <div class="project-actions">
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
      </div>
    </div>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No active projects. Create a project above.'}</p>`}`);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  const action = `/projects/${project.id}`;
  const query = `?filter=${filter}`;
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="${action}/rename${query}" style="margin-top:24px">
      <label for="new-project-name">New project name</label>
      <div class="create-fields"><input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <h2>Tasks</h2>
    <form method="post" action="${action}/tasks${query}">
      <label for="task-title">Task title</label>
      <div class="create-fields"><input id="task-title" name="title" type="text" autocomplete="off"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form method="get" action="${action}" style="margin-top:24px">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? tasks.map(task => `<div class="task-row" data-testid="task-row">
      <form method="post" action="${action}/tasks/${task.id}/completion${query}">
        <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
      <form class="task-rename" method="post" action="${action}/tasks/${task.id}/rename${query}">
        <label for="new-task-title-${task.id}">New task title</label>
        <div class="create-fields"><input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
      </form>
    </div>`).join('') : '<p class="empty">No tasks to show.</p>'}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return html(res, 200, projectsPage(projectFilter(url)));
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(req);
      const name = (body.get('name') || '').trim();
      if (!name) return html(res, 200, projectsPage(projectFilter(url), 'Project name is required'));
      createProject.run(name);
      return redirect(res, '/');
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (req.method === 'POST' && archiveMatch) {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && getProject.get(id)) {
        setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        return redirect(res, archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived');
      }
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/rename|\/tasks(?:\/([1-9]\d*)\/(completion|rename))?)?$/.exec(url.pathname);
    if (match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        const filter = taskFilter(url);
        if (req.method === 'GET' && url.pathname === `/projects/${id}`) {
          return html(res, 200, projectPage(project, filter));
        }
        if (req.method === 'POST' && project.archived) {
          return html(res, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        }
        if (req.method === 'POST' && url.pathname === `/projects/${id}/rename`) {
          const body = await readForm(req);
          const name = (body.get('name') || '').trim();
          if (!name) return html(res, 200, projectPage(project, filter, 'Project name is required'));
          renameProject.run(name, id);
          return redirect(res, `/projects/${id}?filter=${filter}`);
        }
        if (req.method === 'POST' && url.pathname === `/projects/${id}/tasks`) {
          const body = await readForm(req);
          const title = (body.get('title') || '').trim();
          if (!title) return html(res, 200, projectPage(project, filter, 'Task title is required'));
          createTask.run(id, title);
          return redirect(res, `/projects/${id}?filter=${filter}`);
        }
        if (req.method === 'POST' && match[2]) {
          const taskId = Number(match[2]);
          if (Number.isSafeInteger(taskId) && getTask.get(taskId, id)) {
            const body = await readForm(req);
            if (match[3] === 'rename') {
              const title = (body.get('title') || '').trim();
              if (!title) return html(res, 200, projectPage(project, filter, 'Task title is required'));
              renameTask.run(title, taskId, id);
              return redirect(res, `/projects/${id}?filter=${filter}`);
            }
            const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskId, id);
            if (result.changes) return redirect(res, `/projects/${id}?filter=${filter}`);
          }
        }
      }
    }
    html(res, 404, page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>'));
  } catch (error) {
    if (error.status === 413) return html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
