import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f7fa; color: #182536; font-family: system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2e9; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .fields { display: flex; gap: 12px; flex-wrap: wrap; }
  input[type="text"] { flex: 1; min-width: 180px; padding: 12px; border: 1px solid #8290a0; border-radius: 6px; font: inherit; }
  input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
  select { padding: 10px; font: inherit; }
  .task-filter { margin-top: 24px; }
  button { padding: 12px 18px; border: 1px solid #2056ad; border-radius: 6px; background: #2056ad; color: white; font: inherit; cursor: pointer; }
  :focus-visible { outline: 3px solid #d38b13; outline-offset: 3px; }
  ul { padding: 0; list-style: none; }
  li { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid #dce2e9; padding: 18px 0; }
  .name { overflow-wrap: anywhere; min-width: 0; }
  li form { flex-shrink: 0; }
  [role="alert"] { color: #9d241e; }
  .empty { color: #566578; }
  @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
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

export function createApp(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  )`);
  database.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id ASC');
  const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare(`SELECT id, title, completed FROM tasks
    WHERE project_id = ? AND (? = 'All' OR completed = ?) ORDER BY id ASC`);
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

  function projectPage(project, filter, error = '') {
    const tasks = listTasks.all(project.id, filter, filter === 'Completed' ? 1 : 0);
    return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
<form action="/" method="get"><button type="submit">Projects</button></form>
<h2>Tasks</h2>
<form method="post" action="/projects/${project.id}/tasks">
<input type="hidden" name="filter" value="${filter}">
<label for="task-title">Task title</label>
<div class="fields"><input id="task-title" name="title" type="text"${error ? ' aria-describedby="task-error" aria-invalid="true"' : ''}><button type="submit">Create task</button></div>
${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
</form>
<form class="task-filter" method="get" action="/projects/${project.id}">
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${['All', 'Open', 'Completed'].map((option) => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select>
<noscript><button type="submit">Apply filter</button></noscript>
</form>
${tasks.length ? `<ul>${tasks.map((task) => `<li data-testid="task-row"><span class="name">${escapeHtml(task.title)}</span><form method="post" action="/projects/${project.id}/tasks/${task.id}/completion"><input type="hidden" name="filter" value="${filter}"><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()"><noscript><button type="submit">Save completion</button></noscript></form></li>`).join('')}</ul>` : '<p class="empty">No tasks match this filter.</p>'}`);
  }

  function projectsPage(error = '') {
    const projects = listProjects.all();
    return page('Projects', `<h1>Workboard</h1>
<form method="post" action="/projects">
<label for="project-name">Project name</label>
<div class="fields"><input id="project-name" name="name" type="text"${error ? ' aria-describedby="name-error" aria-invalid="true"' : ''}><button type="submit">Create project</button></div>
${error ? `<p id="name-error" role="alert">${escapeHtml(error)}</p>` : ''}
</form>
<h2>Projects</h2>
${projects.length ? `<ul>${projects.map((project) => `<li data-testid="project-row"><span class="name">${escapeHtml(project.name)}</span><form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form></li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}`);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname;
      const projectRoute = pathname.match(/^\/projects\/([1-9]\d*)(?:\/tasks(?:\/([1-9]\d*)\/completion)?)?$/);
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        sendHtml(response, 200, projectsPage());
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          sendHtml(response, 422, projectsPage('Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (projectRoute) {
        const id = Number(projectRoute[1]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
          return;
        }
        const normalizeFilter = (value) => ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
        if (request.method === 'GET' && pathname === `/projects/${id}`) {
          sendHtml(response, 200, projectPage(project, normalizeFilter(url.searchParams.get('filter'))));
        } else if (request.method === 'POST' && pathname.endsWith('/tasks')) {
          const form = await readForm(request);
          const title = (form.get('title') ?? '').trim();
          const filter = normalizeFilter(form.get('filter'));
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(id, title);
          response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
          response.end();
        } else if (request.method === 'POST' && projectRoute[2]) {
          const form = await readForm(request);
          const taskId = Number(projectRoute[2]);
          const result = Number.isSafeInteger(taskId)
            ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id)
            : { changes: 0 };
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          response.writeHead(303, { Location: `/projects/${id}?filter=${normalizeFilter(form.get('filter'))}` });
          response.end();
        } else {
          sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
        }
      } else {
        sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        sendHtml(response, error.status ?? 500, page('Error', '<h1>Unable to complete request</h1>'));
      } else {
        response.end();
      }
    }
  });
  server.on('close', () => database.close());
  return server;
}
