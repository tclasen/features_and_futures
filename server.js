import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
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
  );
  CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, id);`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6fa; color: #182339; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  input { width: 100%; padding: 10px; font: inherit; border: 1px solid #7c899f; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #2457b8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #19448f; }
  :focus-visible { outline: 3px solid #b25d00; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  [role=alert] { color: #9d1829; background: #fff0f2; padding: 12px; border-radius: 6px; }
  .projects, .tasks, .create, .filter { margin-top: 32px; }
  select { padding: 10px; font: inherit; }
  .task { border-top: 1px solid #dce2eb; padding: 16px 0; }
  .task label { display: flex; gap: 12px; align-items: center; margin: 0; overflow-wrap: anywhere; }
  .task input { width: auto; flex-shrink: 0; }
  .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dce2eb; }
  .project span { overflow-wrap: anywhere; min-width: 0; }
  .project form { flex-shrink: 0; }
  @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">${projects.length ? projects.map(project => `
      <div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p>No projects yet.</p>'}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit">Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section class="tasks" aria-label="Tasks">${tasks.length ? tasks.map(task => `
      <div class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </div>`).join('') : '<p>No matching tasks.</p>'}</section>`);
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

function sendHtml(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectsPage());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(res, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      if (parts[4]) {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId).changes) {
          sendHtml(res, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(res, 200, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(projectId, title);
      }
      res.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}` });
      res.end();
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, page('Error', `<h1>${error.status === 413 ? 'Request too large' : 'Unable to complete request'}</h1>`));
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
