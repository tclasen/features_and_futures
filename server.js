import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
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
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

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
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #172338; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 28px; }
    h1 { font-size: 2rem; margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { padding: 24px; background: white; border: 1px solid #d6dee9; border-radius: 10px; }
    .fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; border: 1px solid #79879a; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { background: #2459bd; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .summary { color: #526177; }
    button:hover { background: #194590; }
    :focus-visible { outline: 3px solid #e69400; outline-offset: 3px; }
    [role="alert"] { color: #9c2020; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 24px; border: 1px solid #d6dee9; border-radius: 10px; background: white; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project form { flex-shrink: 0; }
    .empty { color: #526177; }
    .navigation { margin-bottom: 24px; }
    .filter { margin-top: 24px; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #79879a; border-radius: 6px; background: white; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task { flex-direction: column; align-items: stretch; }
    .task input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task .rename label { margin-bottom: 8px; }
    @media (max-width: 540px) { main { margin: 20px auto; padding: 16px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main><script>
document.querySelectorAll('[data-autosubmit]').forEach(control => {
  control.addEventListener('change', () => control.form.requestSubmit());
});
</script></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" data-autosubmit>${['Active', 'Archived'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <section class="projects" aria-label="Projects">${projects.map((project) => `
      <div class="project" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <div class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</div></div>
        <div class="actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </div>`).join('')}${projects.length ? '' : `<p class="empty">No ${filter.toLowerCase()} projects.</p>`}</section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="navigation" method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create navigation" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="fields"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="fields"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-autosubmit>${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <section class="projects" aria-label="Tasks">${tasks.map(task => `
      <div class="project task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-autosubmit><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="fields"><input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
        </form>
      </div>`).join('')}${tasks.length ? '' : '<p class="empty">No matching tasks.</p>'}</section>`);
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = projectFilter(form.get('filter'));
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', filter));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: filter === 'Archived' ? '/?filter=Archived' : '/' });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/rename$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectPage(project, filter, 'Project name is required'));
        return;
      }
      renameProject.run(name, id);
      response.writeHead(303, { Location: `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}` });
      response.end();
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/(archive|restore)$/.test(url.pathname)) {
      const [, , rawId, action] = url.pathname.split('/');
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || !getProject.get(id)) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      setArchived.run(action === 'archive' ? 1 : 0, id);
      response.writeHead(303, { Location: action === 'restore' ? '/?filter=Archived' : '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
    } else if (request.method === 'POST' && /^\/projects\/[1-9]\d*\/tasks(?:\/[1-9]\d*\/(?:completion|rename))?$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = Number(parts[2]);
      const project = Number.isSafeInteger(projectId) ? getProject.get(projectId) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1>'));
        return;
      }
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const filter = taskFilter(form.get('filter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived project cannot be changed'));
        return;
      }
      if (parts.length === 4) {
        const title = (form.get('title') || '').trim();
        if (!title) {
          sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
          return;
        }
        insertTask.run(projectId, title);
      } else {
        const taskId = Number(parts[4]);
        if (!Number.isSafeInteger(taskId) || !getTask.get(taskId, projectId)) {
          sendHtml(response, 404, page('Task not found', '<h1>Task not found</h1>'));
          return;
        }
        if (parts[5] === 'rename') {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          renameTask.run(title, taskId, projectId);
        } else {
          updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, projectId);
        }
      }
      response.writeHead(303, { Location: `/projects/${projectId}${filter === 'All' ? '' : `?filter=${filter}`}` });
      response.end();
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
