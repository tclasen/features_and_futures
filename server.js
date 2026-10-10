import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
`);
// Upgrade existing databases without changing project IDs or task ownership.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
}
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.id
  ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
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
    body { margin: 0; background: #f4f6fa; color: #17243b; font: 17px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 30px #17243b0d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input { width: 100%; padding: 12px; border: 1px solid #8994a6; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244fc5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #193b99; }
    button:disabled { opacity: 0.6; cursor: default; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    :focus-visible { outline: 3px solid #e3a400; outline-offset: 3px; }
    .create button { margin-top: 16px; }
    .projects { margin-top: 32px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dce1ea; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .task { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 18px 0; border-top: 1px solid #dce1ea; overflow-wrap: anywhere; }
    .task input { width: auto; flex-shrink: 0; }
    .task label { margin: 0; min-width: 0; }
    .task .rename-task { flex-basis: 100%; }
    .task .rename-task input { width: 100%; margin: 8px 0; }
    .filter { margin-top: 24px; }
    select { padding: 10px; font: inherit; }
    .back { margin-bottom: 24px; }
    [role="alert"] { color: #a11818; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } .project { align-items: flex-start; flex-direction: column; gap: 10px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <p role="alert" id="task-error"${error ? '' : ' hidden'}>${escapeHtml(error)}</p>
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">${['All', 'Open', 'Completed'].map((option) =>
        `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <div>${tasks.map((task) => `
      <div class="task" data-testid="task-row">
        <input type="checkbox" id="task-${task.id}" data-task-id="${task.id}"
          aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        <form class="rename-task" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </div>`).join('')}${tasks.length ? '' : '<p>No tasks to show.</p>'}</div>
    <script>
      document.getElementById('task-filter').addEventListener('change', (event) => {
        event.target.form.requestSubmit();
      });
      document.querySelectorAll('[data-task-id]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          const alert = document.getElementById('task-error');
          try {
            const response = await fetch('/projects/${project.id}/tasks/' + checkbox.dataset.taskId, {
              method: 'POST',
              body: new URLSearchParams({ completed: checkbox.checked ? '1' : '0' }),
            });
            if (!response.ok) throw new Error('Unable to save task');
            alert.hidden = true;
            if (document.getElementById('task-filter').value !== 'All') {
              window.location.reload();
            }
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            alert.textContent = 'Unable to save task. Please try again.';
            alert.hidden = false;
          } finally {
            checkbox.disabled = false;
          }
        });
      });
    </script>`);
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter">${['Active', 'Archived'].map((option) =>
        `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}</select>
    </form>
    <div class="projects">${projects.map((project) => `
      <div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>
      </div>`).join('')}${projects.length ? '' : '<p>No projects yet.</p>'}</div>
    <script>
      document.getElementById('project-filter').addEventListener('change', (event) => {
        event.target.form.requestSubmit();
      });
    </script>`);
}

function sendHtml(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectList('', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)(?:\/(?:tasks(?:\/([1-9]\d*)(\/rename)?)?|archive|restore|rename))?$/.exec(pathname);
    if (projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        if (request.method === 'POST' && (pathname === `/projects/${id}/archive` || pathname === `/projects/${id}/restore`)) {
          const archived = pathname.endsWith('/archive');
          updateProjectArchive.run(archived ? 1 : 0, id);
          response.writeHead(303, { Location: archived ? '/' : '/?filter=Archived' });
          response.end();
          return;
        }
        if (request.method === 'GET' && pathname === `/projects/${id}`) {
          const filter = url.searchParams.get('filter');
          sendHtml(response, 200, projectPage(project, ['Open', 'Completed'].includes(filter) ? filter : 'All'));
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/rename`) {
          const form = await readForm(request);
          const currentProject = findProject.get(id);
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, 'All', 'Archived project'));
            return;
          }
          const name = (form.get('name') || '').trim();
          if (!name) {
            sendHtml(response, 400, projectPage(currentProject, 'All', 'Project name is required'));
            return;
          }
          renameProject.run(name, id);
          response.writeHead(303, { Location: `/projects/${id}` });
          response.end();
          return;
        }
        if (request.method === 'POST' && pathname === `/projects/${id}/tasks`) {
          const form = await readForm(request);
          if (findProject.get(id).archived) {
            sendHtml(response, 403, projectPage(findProject.get(id), 'All', 'Archived project'));
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, 'All', 'Task title is required'));
            return;
          }
          createTask.run(id, title);
          response.writeHead(303, { Location: `/projects/${id}` });
          response.end();
          return;
        }
        if (request.method === 'POST' && projectRoute[2] && projectRoute[3]) {
          const taskId = Number(projectRoute[2]);
          if (!Number.isSafeInteger(taskId) || !findTask.get(taskId, id)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          const form = await readForm(request);
          const currentProject = findProject.get(id);
          const filter = ['Open', 'Completed'].includes(form.get('filter')) ? form.get('filter') : 'All';
          if (currentProject.archived) {
            sendHtml(response, 403, projectPage(currentProject, filter, 'Archived project'));
            return;
          }
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(currentProject, filter, 'Task title is required'));
            return;
          }
          renameTask.run(title, taskId, id);
          response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
          response.end();
          return;
        }
        if (request.method === 'POST' && projectRoute[2]) {
          const taskId = Number(projectRoute[2]);
          const form = await readForm(request);
          if (findProject.get(id).archived) {
            sendHtml(response, 403, projectPage(findProject.get(id), 'All', 'Archived project'));
            return;
          }
          const completed = form.get('completed');
          if (!['0', '1'].includes(completed)) {
            sendHtml(response, 400, page('Invalid completion', '<h1>Invalid completion state</h1>'));
            return;
          }
          if (Number.isSafeInteger(taskId) && updateTask.run(Number(completed), taskId, id).changes) {
            response.writeHead(204);
            response.end();
            return;
          }
        }
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
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
      database.close();
      process.exit(0);
    });
  });
}
