import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
  COALESCE(SUM(t.completed), 0) AS completed FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Workboard</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6fa; color: #182539; font-family: system-ui, sans-serif; }
main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
h1 { margin-top: 0; } h2 { font-size: 1.2rem; margin-top: 32px; }
label { display: block; font-weight: 600; margin-bottom: 8px; }
input { padding: 10px; font: inherit; border: 1px solid #8795a9; border-radius: 6px; width: 100%; }
button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #245bc0; border: 0; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:hover { background: #194695; } :focus-visible { outline: 3px solid #a64d00; outline-offset: 3px; }
.create { display: flex; gap: 12px; align-items: end; } .field { flex: 1; }
.project { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dce2eb; }
.project span { overflow-wrap: anywhere; min-width: 0; } .project form { flex-shrink: 0; }
select { padding: 10px; font: inherit; }
.task { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid #dce2eb; overflow-wrap: anywhere; }
.task input { width: auto; } .task form { margin: 0; }
[role=alert] { color: #a31919; font-weight: 600; }
@media (max-width: 540px) { main { margin: 16px; padding: 20px; } .create { flex-direction: column; align-items: stretch; } }
</style></head><body><main>${body}</main></body></html>`;
}

function projectList(error = '', name = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form class="create" method="post" action="/projects">
<div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" value="${escape(name)}"></div>
<button type="submit">Create project</button></form>
<h2>Projects</h2>
<form method="get" action="/">
<label for="project-filter">Project filter</label>
<select id="project-filter" name="filter" onchange="this.form.requestSubmit()">${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}</select>
</form>
${projects.length ? projects.map(project => `<div class="project" data-testid="project-row"><span>${escape(project.name)}</span><span data-testid="project-summary">${project.completed}/${project.total} completed</span><form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form><form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form></div>`).join('') : '<p>No projects yet.</p>'}`);
}

function taskFilter(value) {
  return ['Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escape(project.name)}</h1>
<form action="/" method="get"><button type="submit">Projects</button></form>
${project.archived ? '<p>Archived project</p>' : ''}
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form class="create" method="post" action="/projects/${project.id}/rename">
<input type="hidden" name="filter" value="${filter}">
<div class="field"><label for="new-project-name">New project name</label><input id="new-project-name" name="name"${project.archived ? ' disabled' : ''}></div>
<button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></form>
<h2>Tasks</h2>
<form class="create" method="post" action="/projects/${project.id}/tasks">
<input type="hidden" name="filter" value="${filter}">
<div class="field"><label for="task-title">Task title</label><input id="task-title" name="title"></div>
<button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></form>
<form method="get" action="/projects/${project.id}">
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${['All', 'Open', 'Completed'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}</select>
</form>
${tasks.map(task => `<div class="task" data-testid="task-row">
<form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
<input type="hidden" name="filter" value="${filter}">
<input type="checkbox" name="completed" value="1" aria-label="Complete ${escape(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
</form><span>${escape(task.title)}</span></div>`).join('')}`);
}

async function formData(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectList('', '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await formData(req);
      const name = (body.get('name') || '').trim();
      if (!name) {
        html(res, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const result = archiveProject.run(parts[3] === 'archive' ? 1 : 0, parts[2]);
      if (!result.changes) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      res.writeHead(303, { Location: parts[3] === 'archive' ? '/' : '/?filter=Archived' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/rename$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await formData(req);
      const filter = taskFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        return;
      }
      const name = (body.get('name') || '').trim();
      if (!name) {
        html(res, 400, projectPage(project, filter, 'Project name is required'));
        return;
      }
      renameProject.run(name, project.id);
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      res.end();
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/completion)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const project = findProject.get(parts[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const body = await formData(req);
      const filter = taskFilter(body.get('filter'));
      if (project.archived) {
        html(res, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        return;
      }
      if (parts[4]) {
        const result = updateTask.run(body.get('completed') === '1' ? 1 : 0, parts[4], project.id);
        if (!result.changes) {
          html(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (body.get('title') || '').trim();
        if (!title) {
          html(res, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(project.id, title);
      }
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      res.end();
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Something went wrong'}</h1>`));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
