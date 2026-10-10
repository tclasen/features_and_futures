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
// Upgrade databases created before project archiving was introduced.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
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
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f7fb; color: #17243a; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 4px 24px #17243a0d; }
  h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  .create { display: flex; flex-wrap: wrap; gap: 12px; }
  input { flex: 1; min-width: 180px; padding: 10px 12px; border: 1px solid #8794a9; border-radius: 6px; font: inherit; }
  input[type=checkbox] { flex: none; min-width: 0; width: 20px; height: 20px; }
  select { padding: 10px; font: inherit; }
  .filter { margin-top: 24px; }
  button { padding: 10px 16px; border: 0; border-radius: 6px; background: #214fb0; color: white; font: inherit; cursor: pointer; }
  button:hover { background: #183d8c; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  li { flex-wrap: wrap; }
  :focus-visible { outline: 3px solid #e19520; outline-offset: 3px; }
  ul { list-style: none; padding: 0; margin: 28px 0 0; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #e2e7ef; }
  li span { overflow-wrap: anywhere; min-width: 0; }
  li form { flex-shrink: 0; }
  [role=alert] { color: #9e2020; margin: 12px 0; }
  @media (max-width: 600px) { main { margin: 16px; padding: 24px; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', value = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
<form method="post" action="/projects">
<label for="project-name">Project name</label>
<div class="create"><input id="project-name" name="name" value="${escapeHtml(value)}" type="text"><button type="submit">Create project</button></div>
${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
</form>
<form method="get" action="/" class="filter">
<label for="project-filter">Project filter</label>
<select id="project-filter" name="filter" onchange="this.form.requestSubmit()">${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
</form>
${projects.length ? `<ul>${projects.map(project => `<li data-testid="project-row"><span>${escapeHtml(project.name)}</span><span data-testid="project-summary">${project.completed}/${project.total} completed</span><form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form><form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form></li>`).join('')}</ul>` : '<p>No projects to show.</p>'}`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
${project.archived ? '<p>Archived project</p>' : ''}
<form method="get" action="/"><button type="submit">Projects</button></form>
<form method="post" action="/projects/${project.id}/rename" class="filter">
<input type="hidden" name="filter" value="${filter}">
<label for="new-project-name">New project name</label>
<div class="create"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
</form>
<form method="post" action="/projects/${project.id}/tasks" class="filter">
<input type="hidden" name="filter" value="${filter}">
<label for="task-title">Task title</label>
<div class="create"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
</form>
<form method="get" action="/projects/${project.id}" class="filter">
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
</form>
${tasks.length ? `<ul>${tasks.map(task => `<li data-testid="task-row"><span>${escapeHtml(task.title)}</span>
<form method="post" action="/projects/${project.id}/tasks/${task.id}">
<input type="hidden" name="filter" value="${filter}">
<input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
</form></li>`).join('')}</ul>` : '<p>No tasks to show.</p>'}`);
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
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
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const name = ((await readForm(req)).get('name') || '').trim();
      if (!name) return sendHtml(res, 400, projectList('Project name is required'));
      addProject.run(name);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    const renameMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/rename$/);
    if (req.method === 'POST' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (!project) return sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      if (project.archived) return sendHtml(res, 403, projectPage(project, filter, 'Archived project is read-only'));
      const name = (form.get('name') || '').trim();
      if (!name) return sendHtml(res, 400, projectPage(project, filter, 'Project name is required'));
      renameProject.run(name, project.id);
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      return res.end();
    }
    const archiveMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (req.method === 'POST' && archiveMatch) {
      const result = setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (!result.changes) return sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
      res.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
      return res.end();
    }
    const taskMatch = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*))?$/);
    if (req.method === 'POST' && taskMatch) {
      const project = getProject.get(taskMatch[1]);
      if (!project) return sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
      if (project.archived) return sendHtml(res, 403, projectPage(project, taskFilter(url.searchParams.get('filter')), 'Archived project is read-only'));
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      if (taskMatch[2]) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
        if (!result.changes) return sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) return sendHtml(res, 400, projectPage(project, filter, 'Task title is required'));
        addTask.run(project.id, title);
      }
      res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      return res.end();
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) return sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    }
    sendHtml(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (error.status === 413 && !res.headersSent) return sendHtml(res, 413, page('Request too large', '<h1>Request too large</h1>'));
    console.error(error);
    if (!res.headersSent) sendHtml(res, 500, page('Server error', '<h1>Server error</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
