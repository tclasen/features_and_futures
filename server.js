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
// Migrate databases created before archive support without changing project IDs.
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks gain the same default as newly created tasks.
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listProjects = db.prepare(`
  SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');

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
    button:disabled { opacity: .5; cursor: not-allowed; }
    .project { flex-wrap: wrap; }
    .project-info { flex: 1; }
    .project-info span { display: block; }
    :focus-visible { outline: 3px solid #d28c00; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects, .tasks, .filter { margin-top: 32px; }
    .task { padding: 18px 0; border-top: 1px solid #e1e6ed; overflow-wrap: anywhere; }
    .task label { display: flex; align-items: center; gap: 12px; margin: 0; font-weight: 400; }
    .task input[type="checkbox"] { flex-shrink: 0; width: 20px; height: 20px; }
    .task .create label { margin-bottom: 8px; font-weight: 600; }
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

function projectsPage(error = '', name = '', filter = 'Active') {
  const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
    <div class="project" data-testid="project-row">
      <div class="project-info">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
      </div>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
        <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
      </form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}" autocomplete="off">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map(value => `<option${value === filter ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
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
            ${project.archived ? 'disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="create" action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map(value => `<option${value === task.priority ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
      </div>`).join('');
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="back" action="/" method="get"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/rename" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text" autocomplete="off">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
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
      sendHtml(res, 200, projectsPage('', '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 400, projectsPage('Project name is required', '', form.get('filter') === 'Archived' ? 'Archived' : 'Active'));
        return;
      }
      createProject.run(name);
      redirect(res, '/');
      return;
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (renameMatch && req.method === 'POST') {
      const id = Number(renameMatch[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : null;
      if (project) {
        const form = await readForm(req);
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed'));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(res, 400, projectPage(project, filter, 'Project name is required'));
          return;
        }
        renameProject.run(name, id);
        redirect(res, `/projects/${id}${filter === 'All' ? '' : `?filter=${filter}`}`);
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (archiveMatch && req.method === 'POST') {
      const id = Number(archiveMatch[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, id);
        redirect(res, archiveMatch[2] === 'restore' ? '/?filter=Archived' : '/');
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority))?)?$/.exec(url.pathname);
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
        if (project.archived) {
          sendHtml(res, 403, projectPage(project, filter, 'Archived project cannot be changed'));
          return;
        }
        if (match[2]) {
          const taskId = Number(match[2]);
          const existing = Number.isSafeInteger(taskId) && findTask.get(taskId, id);
          if (existing && match[3] === 'rename' && !(form.get('title') || '').trim()) {
            sendHtml(res, 400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          if (existing && match[3] === 'priority' && !['Low', 'Normal', 'High'].includes(form.get('priority'))) {
            sendHtml(res, 400, projectPage(project, filter, 'Invalid task priority'));
            return;
          }
          const changes = existing && (match[3] === 'rename'
            ? renameTask.run(form.get('title').trim(), taskId, id).changes
            : match[3] === 'priority'
              ? setTaskPriority.run(form.get('priority'), taskId, id).changes
              : updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id).changes);
          if (!changes) {
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
