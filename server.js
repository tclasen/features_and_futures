import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    :root { font-family: system-ui, sans-serif; color: #172439; background: #f4f6fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input:not([type="checkbox"]), select { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #718096; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; background: #2454bc; color: white; border: 0; border-radius: 6px; font: inherit; cursor: pointer; }
    button:disabled { background: #718096; cursor: not-allowed; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #e69619; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { list-style: none; padding: 0; margin-top: 28px; }
    .project { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dee4ee; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .task { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid #dee4ee; overflow-wrap: anywhere; }
    .task label { margin: 0; font-weight: 400; }
    .filter { margin-top: 24px; }
    [role="alert"] { color: #a51c25; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main>
<script>
  document.querySelectorAll('[data-auto-submit]').forEach(control => {
    control.addEventListener('change', () => control.form.requestSubmit());
  });
</script>
</body>
</html>`;
}

export function createApplication(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  )`);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  // Upgrade databases created before archive support without changing IDs or tasks.
  if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
    db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
    COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
  const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

  function projectList(error = '', name = '', filter = 'Active') {
    const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
    return page('Projects', `<h1>Workboard</h1>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form class="create" method="post" action="/projects">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" value="${escapeHtml(name)}">
        <button type="submit">Create project</button>
      </form>
      <form class="filter" method="get" action="/">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" data-auto-submit>
          ${['Active', 'Archived'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <ul class="projects">${projects.map(project => `<li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>`);
  }

  function projectPage(project, filter, error = '') {
    const tasks = listTasks.all(project.id).filter(task =>
      filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
    return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
      <form method="get" action="/"><button type="submit">Projects</button></form>
      ${project.archived ? '<p>Archived project</p>' : ''}
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form class="create" method="post" action="/projects/${project.id}/tasks">
        <input type="hidden" name="filter" value="${filter}">
        <label for="task-title">Task title</label>
        <input id="task-title" name="title">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </form>
      <form class="filter" method="get" action="/projects/${project.id}">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" data-auto-submit>
          ${['All', 'Open', 'Completed'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <ul class="projects">${tasks.map(task => `<li class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="completed" value="0">
          <input type="checkbox" name="completed" value="1" id="task-${task.id}" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-auto-submit>
        </form>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
      </li>`).join('')}</ul>`);
  }

  function taskFilter(value) {
    return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
  }

  async function readForm(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 64 * 1024) {
        const error = new Error('Request too large');
        error.status = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  }

  const server = http.createServer(async (request, response) => {
    const sendHtml = (status, html) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname;
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        sendHtml(200, projectList('', '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active'));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const body = await readForm(request);
        const name = (body.get('name') ?? '').trim();
        if (!name) {
          sendHtml(400, projectList('Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(pathname)) {
        const [, , idValue, action] = pathname.split('/');
        const id = Number(idValue);
        if (!Number.isSafeInteger(id) || !setArchived.run(action === 'archive' ? 1 : 0, id).changes) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        response.writeHead(303, { Location: action === 'restore' ? '/?filter=Archived' : '/' });
        response.end();
      } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
          return;
        }
        sendHtml(200, projectPage(project, taskFilter(url.searchParams.get('filter'))));
      } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/completion)?$/.test(pathname)) {
        const parts = pathname.split('/');
        const projectId = Number(parts[2]);
        const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        if (project.archived) {
          sendHtml(403, projectPage(project, filter, 'Archived projects cannot be changed'));
          return;
        }
        if (parts.length === 4) {
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            sendHtml(400, projectPage(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(projectId, title);
        } else {
          const taskId = Number(parts[4]);
          const completed = body.getAll('completed').at(-1);
          if (!Number.isSafeInteger(taskId) || !['0', '1'].includes(completed)) {
            sendHtml(400, page('Invalid request', '<h1>Invalid completion state</h1>'));
            return;
          }
          if (!updateTask.run(Number(completed), taskId, projectId).changes) {
            sendHtml(404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        response.writeHead(303, { Location: `/projects/${projectId}?filter=${filter}` });
        response.end();
      } else {
        sendHtml(404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      if (error.status === 413 && !response.headersSent) {
        sendHtml(413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      console.error(error);
      if (!response.headersSent) sendHtml(500, page('Server error', '<h1>Something went wrong</h1>'));
      else response.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApplication(process.env.DB_PATH || './data/workboard.sqlite');
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
    console.log(`Workboard listening on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
