import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title><link rel="stylesheet" href="/styles.css"></head>
<body><main>${content}</main></body></html>`;
}

const projectFilters = ['Active', 'Archived'];

function readProjectFilter(value) {
  return projectFilters.includes(value) ? value : 'Active';
}

function projectList(projects, filter, error = '') {
  return page('Projects', `<h1>Workboard</h1>
    <form method="post" action="/projects" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="input-group"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <form method="get" action="/" class="project-filter">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${projectFilters.map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects" class="project-list">
      ${projects.map((project) => `<div data-testid="project-row" class="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </div>`).join('')}
    </section>`);
}

const taskFilters = ['All', 'Open', 'Completed'];

function readTaskFilter(value) {
  return taskFilters.includes(value) ? value : 'All';
}

function projectPath(projectId, filter) {
  return `/projects/${projectId}${filter === 'All' ? '' : `?filter=${filter}`}`;
}

function projectPage(project, tasks, filter, error = '') {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form method="post" action="/projects/${project.id}/rename" class="create-form project-rename">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="input-group"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form method="post" action="/projects/${project.id}/tasks" class="create-form task-create">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="input-group"><input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <form method="get" action="/projects/${project.id}" class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${taskFilters.map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks" class="project-list">
      ${tasks.map((task) => `<div data-testid="task-row" class="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
      </div>`).join('')}
    </section>`);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createWorkboardServer(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  // Existing databases predate archiving; preserve their projects as active.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  database.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  const listProjects = database.prepare(`SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
  const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const listTasks = database.prepare(`SELECT id, title, completed FROM tasks
    WHERE project_id = ? AND (? IS NULL OR completed = ?) ORDER BY id`);
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  function tasksFor(projectId, filter) {
    const completed = filter === 'All' ? null : Number(filter === 'Completed');
    return listTasks.all(projectId, completed, completed);
  }

  const server = createServer(async (request, response) => {
    function send(status, body, type = 'text/html; charset=utf-8') {
      response.writeHead(status, { 'Content-Type': type });
      response.end(body);
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        return send(200, JSON.stringify({ status: 'ok' }), 'application/json');
      }
      if (request.method === 'GET' && url.pathname === '/styles.css') {
        return send(200, stylesheet, 'text/css; charset=utf-8');
      }
      if (request.method === 'GET' && url.pathname === '/') {
        const filter = readProjectFilter(url.searchParams.get('filter'));
        return send(200, projectList(listProjects.all(Number(filter === 'Archived')), filter));
      }
      if (request.method === 'POST' && url.pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        const filter = readProjectFilter(form.get('filter'));
        if (!name) return send(400, projectList(listProjects.all(Number(filter === 'Archived')), filter, 'Project name is required'));
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        return response.end();
      }
      const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
      if (request.method === 'POST' && archiveMatch) {
        const id = Number(archiveMatch[1]);
        if (Number.isSafeInteger(id) && findProject.get(id)) {
          const archived = archiveMatch[2] === 'archive';
          updateArchive.run(Number(archived), id);
          response.writeHead(303, { Location: archived ? '/' : '/?filter=Archived' });
          return response.end();
        }
      }
      const match = /^\/projects\/([1-9]\d*)(?:\/rename|\/tasks(?:\/([1-9]\d*)\/completion)?)?$/.exec(url.pathname);
      if (match) {
        const id = Number(match[1]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (project) {
          if (request.method === 'GET' && url.pathname === `/projects/${id}`) {
            const filter = readTaskFilter(url.searchParams.get('filter'));
            return send(200, projectPage(project, tasksFor(id, filter), filter));
          }
          if (request.method === 'POST' && url.pathname !== `/projects/${id}`) {
            const form = await readForm(request);
            const filter = readTaskFilter(form.get('filter'));
            if (project.archived) {
              return send(409, projectPage(project, tasksFor(id, filter), filter, 'Archived project is read-only'));
            }
            if (url.pathname === `/projects/${id}/rename`) {
              const name = (form.get('name') ?? '').trim();
              if (!name) return send(400, projectPage(project, tasksFor(id, filter), filter, 'Project name is required'));
              renameProject.run(name, id);
            } else if (match[2]) {
              const taskId = Number(match[2]);
              if (!Number.isSafeInteger(taskId)) {
                return send(404, page('Not found', '<h1>Task not found</h1>'));
              }
              const result = updateCompletion.run(Number(form.get('completed') === '1'), taskId, id);
              if (!result.changes) return send(404, page('Not found', '<h1>Task not found</h1>'));
            } else {
              const title = (form.get('title') ?? '').trim();
              if (!title) return send(400, projectPage(project, tasksFor(id, filter), filter, 'Task title is required'));
              insertTask.run(id, title);
            }
            response.writeHead(303, { Location: projectPath(id, filter) });
            return response.end();
          }
        }
      }
      send(404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
    } catch (error) {
      if (!error.status) console.error(error);
      send(error.status ?? 500, page('Error', '<h1>Unable to complete request</h1><a href="/">Projects</a>'));
    }
  });
  server.on('close', () => database.close());
  return server;
}
