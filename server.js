import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
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
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    body { margin: 0; background: #f5f7fb; color: #18263b; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 24px; }
    h1 { font-size: 32px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input, button, select { font: inherit; border-radius: 6px; padding: 10px 14px; }
    input[type="checkbox"] { flex: none; min-width: 0; width: 20px; height: 20px; }
    .filter { margin-top: 24px; }
    input { border: 1px solid #8894a7; flex: 1; min-width: 160px; }
    button { background: #244fbe; color: white; border: 1px solid #244fbe; cursor: pointer; }
    button:hover { background: #193a91; }
    :focus-visible { outline: 3px solid #b15c00; outline-offset: 3px; }
    .projects { padding: 0; list-style: none; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: white; border: 1px solid #d6dce7; border-radius: 8px; padding: 18px; margin: 12px 0; }
    .name { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a01b1b; margin: 16px 0; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', input = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="controls">
        <input id="project-name" name="name" value="${escapeHtml(input)}" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <h2>Projects</h2>
    ${projects.length ? `<ul class="projects">${projects.map(project => `
      <li class="project" data-testid="project-row">
        <span class="name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p>No projects yet.</p>'}`);
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h2>Tasks</h2>
    <form method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="controls">
        <input id="task-title" name="title" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.submit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul class="projects">${tasks.map(task => `
      <li class="project" data-testid="task-row">
        <span class="name">${escapeHtml(task.title)}</span>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.submit()">
        </form>
      </li>`).join('')}</ul>` : '<p>No matching tasks.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
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
    const path = url.pathname;
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && path === '/') {
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(path)) {
      const [, , projectId, , taskId] = path.split('/');
      const project = findProject.get(projectId);
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) {
          sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
          return;
        }
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        createTask.run(project.id, title);
      }
      response.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    sendHtml(response, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
