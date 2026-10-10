import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}

const taskPriorities = ['Low', 'Normal', 'High'];

const listProjects = database.prepare(`SELECT projects.id, projects.name, projects.archived,
  COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const styles = readFileSync(new URL('./public/styles.css', import.meta.url));
const projectScript = readFileSync(new URL('./public/project.js', import.meta.url));

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
  <link rel="stylesheet" href="/styles.css">
  <script src="/project.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <p class="eyebrow">PROJECT WORKSPACE</p>
    <h1>Workboard</h1>
    <form class="create-form" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      <form class="filter-form" action="/" method="get">
        <label for="project-filter">Project filter</label>
        <select id="project-filter" name="filter" data-submit-on-change>
          ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${projects.length ? `<div class="project-list">${projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
          <form action="/projects/${project.id}" method="get">
            <button class="secondary" type="submit">Open project</button>
          </form>
          <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
            <button class="secondary" type="submit">${project.archived ? 'Restore' : 'Archive'} project</button>
          </form>
        </div>`).join('')}</div>` : '<p class="empty">Your projects will appear here.</p>'}
    </section>`);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return taskPriorities.includes(value) ? value : 'All';
}

function projectLocation(id, filter, priority) {
  const params = new URLSearchParams();
  if (filter !== 'All') params.set('filter', filter);
  if (priority !== 'All') params.set('priorityFilter', priority);
  const query = params.toString();
  return `/projects/${id}${query ? `?${query}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', priority = 'All') {
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority));
  return page(project.name, `
    <form action="/" method="get"><button class="secondary" type="submit">Projects</button></form>
    <p class="eyebrow">PROJECT</p>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="create-form" action="/projects/${project.id}/rename" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="create-form" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <form class="filter-form" action="/projects/${project.id}" method="get">
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" data-submit-on-change>
          ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" data-submit-on-change>
          ${['All', ...taskPriorities].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
        </select>
      </form>
      ${tasks.length ? `<div class="task-list">${tasks.map(task => `
        <div class="task-row" data-testid="task-row">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-submit-on-change>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} data-submit-on-change>
              ${taskPriorities.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form class="task-rename-form" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <input type="hidden" name="priorityFilter" value="${priority}">
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="create-controls">
              <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
          </form>
        </div>`).join('')}</div>` : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

async function readForm(request) {
  const chunks = [];
  let bodySize = 0;
  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > 65536) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
      return;
    }
    if (request.method === 'GET' && url.pathname === '/styles.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(styles);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/project.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(projectScript);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const body = await readForm(request);
      if (!body) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (body.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', projectFilter(body.get('filter'))));
        return;
      }
      createProject.run(name);
      redirect(response, '/');
      return;
    }
    const renameRoute = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameRoute) {
      const id = Number(renameRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', priority));
          return;
        }
        const name = (body.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 400, projectPage(project, filter, 'Project name is required', priority));
          return;
        }
        renameProject.run(name, id);
        redirect(response, projectLocation(id, filter, priority));
        return;
      }
    }
    const archiveRoute = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveRoute) {
      const id = Number(archiveRoute[1]);
      if (Number.isSafeInteger(id) && findProject.get(id)) {
        const archived = archiveRoute[2] === 'archive';
        setProjectArchived.run(archived ? 1 : 0, id);
        redirect(response, archived ? '/' : '/?filter=Archived');
        return;
      }
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', priorityFilter(url.searchParams.get('priorityFilter'))));
        return;
      }
    }
    const taskRoute = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority))?$/.exec(url.pathname);
    if (request.method === 'POST' && taskRoute) {
      const projectId = Number(taskRoute[1]);
      const taskId = taskRoute[2] ? Number(taskRoute[2]) : null;
      const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
      if (project && (taskId === null || Number.isSafeInteger(taskId))) {
        const body = await readForm(request);
        if (!body) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', priority));
          return;
        }
        if (taskId === null) {
          const title = (body.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 400, projectPage(project, filter, 'Task title is required', priority));
            return;
          }
          createTask.run(projectId, title);
        } else {
          let result;
          if (taskRoute[3] === 'rename') {
            const title = (body.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 400, projectPage(project, filter, 'Task title is required', priority));
              return;
            }
            result = renameTask.run(title, taskId, projectId);
          } else if (taskRoute[3] === 'priority') {
            const taskPriority = body.get('priority');
            if (!taskPriorities.includes(taskPriority)) {
              sendHtml(response, 400, projectPage(project, filter, 'Invalid task priority', priority));
              return;
            }
            result = setTaskPriority.run(taskPriority, taskId, projectId);
          } else {
            result = updateTask.run(body.get('completed') === '1' ? 1 : 0, taskId, projectId);
          }
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        }
        redirect(response, projectLocation(projectId, filter, priority));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Error', '<h1>Unable to complete the request</h1>'));
    } else {
      response.end();
    }
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
