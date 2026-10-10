import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  body { font-family: system-ui, sans-serif; color: #172438; background: #f4f6fa; margin: 0; }
  main { max-width: 720px; margin: 48px auto; padding: 24px; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  input, button, select { font: inherit; padding: 10px 14px; border-radius: 6px; }
  input { border: 1px solid #8794a8; max-width: 100%; box-sizing: border-box; }
  button { background: #244db2; color: white; border: 0; cursor: pointer; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #e59e16; outline-offset: 3px; }
  button:disabled, input:disabled { cursor: not-allowed; opacity: 0.6; }
  .project-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #dbe1eb; }
  .project-name { overflow-wrap: anywhere; min-width: 0; }
  .project-row form { flex-shrink: 0; }
  .task-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid #dbe1eb; }
  .task-row label { margin: 0; overflow-wrap: anywhere; }
  .task-controls { margin-top: 24px; }
  [role="alert"] { color: #a01616; }
  @media (max-width: 600px) { main { margin: 16px; } }
</style></head><body><main>${content}</main></body></html>`;
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createApplication(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  database.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);`);
  // Upgrade existing project databases without changing IDs or task ownership.
  if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  const listProjects = database.prepare(`SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
  const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const setArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

  function projectFilter(value) {
    return value === 'Archived' ? 'Archived' : 'Active';
  }

  function projectsPage(error = '', filter = 'Active') {
    const rows = listProjects.all(filter === 'Archived' ? 1 : 0).map(project => `
      <div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
          <button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
        </form>
      </div>`).join('');
    return page('Projects', `<h1>Workboard</h1>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects" method="post">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </form>
      <form class="task-controls" action="/" method="get">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <section aria-label="Projects">${rows}</section>`);
  }

  function taskFilter(value) {
    return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
  }

  function projectPage(project, filter, error = '') {
    const path = `/projects/${project.id}`;
    const rows = listTasks.all(project.id)
      .filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))
      .map(task => `<div class="task-row" data-testid="task-row">
        <form action="${path}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input id="task-${task.id}" type="checkbox" name="completed" value="1"
            aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} ${project.archived ? 'disabled' : ''}
            onchange="this.form.requestSubmit()">
          <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        </form>
      </div>`).join('');
    return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
      <form action="/" method="get"><button type="submit">Projects</button></form>
      ${project.archived ? '<p>Archived project</p>' : ''}
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form class="task-controls" action="${path}/rename" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <label for="new-project-name">New project name</label>
        <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </form>
      <form class="task-controls" action="${path}/tasks" method="post">
        <input type="hidden" name="filter" value="${filter}">
        <label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </form>
      <form class="task-controls" action="${path}" method="get">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
          ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      <section aria-label="Tasks">${rows}</section>`);
  }

  function html(response, status, content) {
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(content);
  }

  const server = createServer(async (request, response) => {
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        html(response, 200, projectsPage('', projectFilter(searchParams.get('filter'))));
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          html(response, 422, projectsPage('Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (request.method === 'POST' && /^\/projects\/\d+\/rename$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
        if (!project) {
          html(response, 404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project cannot be changed'));
          return;
        }
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          html(response, 422, projectPage(project, filter, 'Project name is required'));
          return;
        }
        renameProject.run(name, id);
        response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
        response.end();
      } else if (request.method === 'POST' && /^\/projects\/\d+\/(archive|restore)$/.test(pathname)) {
        const [, , projectId, action] = pathname.split('/');
        const id = Number(projectId);
        const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
        if (!project) {
          html(response, 404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        setArchived.run(action === 'archive' ? 1 : 0, id);
        response.writeHead(303, { Location: action === 'archive' ? '/' : '/?filter=Archived' });
        response.end();
      } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
        if (!project) {
          html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
          return;
        }
        html(response, 200, projectPage(project, taskFilter(searchParams.get('filter'))));
      } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(pathname)) {
        const [, , projectId, , taskId] = pathname.split('/');
        const id = Number(projectId);
        const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
        if (!project) {
          html(response, 404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        if (project.archived) {
          html(response, 403, projectPage(project, filter, 'Archived project cannot be changed'));
          return;
        }
        if (taskId === undefined) {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            html(response, 422, projectPage(project, filter, 'Task title is required'));
            return;
          }
          insertTask.run(id, title);
        } else {
          const taskNumber = Number(taskId);
          const result = Number.isSafeInteger(taskNumber)
            ? updateTask.run(form.get('completed') === '1' ? 1 : 0, taskNumber, id)
            : undefined;
          if (!result?.changes) {
            html(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        response.writeHead(303, { Location: `/projects/${id}?filter=${filter}` });
        response.end();
      } else {
        html(response, 404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        html(response, error.status ?? 500, page('Error', '<h1>Unable to complete request</h1>'));
      } else {
        response.end();
      }
    }
  });
  server.on('close', () => database.close());
  return server;
}
