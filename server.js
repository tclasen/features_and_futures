import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
// Migrate databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
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
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const css = readFileSync(new URL('./public/style.css', import.meta.url));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title><link rel="stylesheet" href="/style.css"></head>
<body><main>${content}</main></body></html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', name = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <li data-testid="project-row"><span>${escapeHtml(project.name)}</span>
      <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </li>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form action="/projects" method="post" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="input-line"><input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      <button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert" class="error">${escapeHtml(error)}</p>` : ''}
    <h2>Projects</h2>
    <form action="/" method="get" class="filter-form">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <ul class="projects">${rows}</ul>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const path = `/projects/${project.id}`;
  const rows = listTasks.all(project.id)
    .filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
    .map(task => `<li data-testid="task-row">
      <form action="${path}/tasks/${task.id}/completion" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <label class="task-label"><input type="checkbox" name="completed" value="1"
          aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''}
          onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
      </form>
    </li>`).join('');
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h2>Tasks</h2>
    <form action="${path}/tasks" method="post" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="input-line"><input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    ${error ? `<p role="alert" class="error">${escapeHtml(error)}</p>` : ''}
    <form action="${path}" method="get" class="filter-form">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <ul class="tasks">${rows}</ul>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return response.end(css);
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return sendHtml(response, 200, projectList('', '', projectFilter(url.searchParams.get('filter'))));
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) return sendHtml(response, 422, projectList('Project name is required', '', projectFilter(form.get('filter'))));
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const archiveRoute = url.pathname.match(/^\/projects\/([1-9]\d*)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveRoute) {
      const id = Number(archiveRoute[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        const archived = archiveRoute[2] === 'archive';
        setArchived.run(archived ? 1 : 0, id);
        response.writeHead(303, { Location: archived ? '/' : '/?filter=Archived' });
        return response.end();
      }
    }
    const projectRoute = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project) {
        return sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
      }
    }
    const taskRoute = url.pathname.match(/^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/completion)?$/);
    if (request.method === 'POST' && taskRoute) {
      const projectId = Number(taskRoute[1]);
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : null;
      if (project) {
        if (project.archived) {
          return sendHtml(response, 403, projectPage(project, 'All', 'Archived project cannot be changed'));
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (taskRoute[2]) {
          const taskId = Number(taskRoute[2]);
          if (!Number.isSafeInteger(taskId) || !updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId).changes) {
            return sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) return sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
          createTask.run(projectId, title);
        }
        response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}` });
        return response.end();
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
