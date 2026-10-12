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

// Validate calendar days directly, without JavaScript Date's timezone or year coercion.
export function isValidDueDate(value) {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
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
    .task { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid #dee4ee; overflow-wrap: anywhere; }
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
  // Project defaults affect only subsequent task creation, never existing tasks.
  if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
    db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
  }
  // Backfill older tasks with Normal regardless of their project's default.
  if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
    db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
  }
  // Empty dates represent no due date for both migrated and newly created tasks.
  if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
    db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  const priorities = ['Low', 'Normal', 'High'];
  const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
  const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
  const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
  const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
  const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
    COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
  const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
  const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
  const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
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

  function projectPage(project, filter, priorityFilter = 'All', error = '', range = { from: '', through: '' }) {
    const tasks = listTasks.all(project.id).filter(task =>
      (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
      (priorityFilter === 'All' || task.priority === priorityFilter) &&
      ((!range.from && !range.through) || (task.due_date &&
        (!range.from || task.due_date >= range.from) &&
        (!range.through || task.due_date <= range.through))));
    const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">`;
    const rangeFields = `<input type="hidden" name="rangeFrom" value="${range.from}">
      <input type="hidden" name="rangeThrough" value="${range.through}">`;
    const editFields = filterFields + rangeFields;
    return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
      <form method="get" action="/"><button type="submit">Projects</button></form>
      ${project.archived ? '<p>Archived project</p>' : ''}
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form class="create" method="post" action="/projects/${project.id}/rename">
        ${editFields}
        <label for="new-project-name">New project name</label>
        <input id="new-project-name" name="name" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </form>
      <form class="filter" method="post" action="/projects/${project.id}/default-priority">
        ${editFields}
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} data-auto-submit>
          ${priorities.map(value => `<option${project.default_priority === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <form class="create" method="post" action="/projects/${project.id}/tasks">
        ${editFields}
        <label for="task-title">Task title</label>
        <input id="task-title" name="title">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </form>
      <form class="filter" method="get" action="/projects/${project.id}">
        ${rangeFields}
        <label for="task-filter">Task filter</label>
        <select id="task-filter" name="filter" data-auto-submit>
          ${['All', 'Open', 'Completed'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter" name="priorityFilter" data-auto-submit>
          ${['All', ...priorities].map(value => `<option${priorityFilter === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </form>
      <form class="filter" method="post" action="/projects/${project.id}/due-range">
        ${editFields}
        <label for="due-from">Due from</label>
        <input id="due-from" name="dueFrom" value="${range.from}">
        <label for="due-through">Due through</label>
        <input id="due-through" name="dueThrough" value="${range.through}">
        <button type="submit">Apply due range</button>
      </form>
      <ul class="projects">${tasks.map(task => `<li class="task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          ${editFields}
          <input type="hidden" name="completed" value="0">
          <input type="checkbox" name="completed" value="1" id="task-${task.id}" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-auto-submit>
        </form>
        <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${editFields}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} data-auto-submit>
            ${priorities.map(value => `<option${task.priority === value ? ' selected' : ''}>${value}</option>`).join('')}
          </select>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${editFields}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${editFields}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" value="${escapeHtml(task.title)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
        </form>
      </li>`).join('')}</ul>`);
  }

  function taskFilter(value) {
    return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
  }

  function priorityFilterValue(value) {
    return priorities.includes(value) ? value : 'All';
  }

  // Applied ranges travel with forms and redirects, never with persisted task data.
  function readRange(parameters) {
    const from = (parameters.get('rangeFrom') ?? '').trim();
    const through = (parameters.get('rangeThrough') ?? '').trim();
    if ((from && !isValidDueDate(from)) || (through && !isValidDueDate(through)) ||
        (from && through && from > through)) return { from: '', through: '' };
    return { from, through };
  }

  function projectLocation(id, filter, priorityFilter, range) {
    const query = new URLSearchParams({ filter });
    if (priorityFilter !== 'All') query.set('priorityFilter', priorityFilter);
    if (range.from) query.set('rangeFrom', range.from);
    if (range.through) query.set('rangeThrough', range.through);
    return `/projects/${id}?${query}`;
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
        sendHtml(200, projectPage(project, taskFilter(url.searchParams.get('filter')),
          priorityFilterValue(url.searchParams.get('priorityFilter')), '', readRange(url.searchParams)));
      } else if (request.method === 'POST' && /^\/projects\/\d+\/due-range$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const priorityFilter = priorityFilterValue(body.get('priorityFilter'));
        const previousRange = readRange(body);
        const from = (body.get('dueFrom') ?? '').trim();
        const through = (body.get('dueThrough') ?? '').trim();
        let error = '';
        if ((from && !isValidDueDate(from)) || (through && !isValidDueDate(through))) {
          error = 'Due range must use valid YYYY-MM-DD dates';
        } else if (from && through && from > through) {
          error = 'Due from must not be after Due through';
        }
        if (error) {
          sendHtml(400, projectPage(project, filter, priorityFilter, error, previousRange));
          return;
        }
        response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, { from, through }) });
        response.end();
      } else if (request.method === 'POST' && /^\/projects\/\d+\/(rename|default-priority)$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const priorityFilter = priorityFilterValue(body.get('priorityFilter'));
        const range = readRange(body);
        const renderProject = error => projectPage(project, filter, priorityFilter, error, range);
        if (project.archived) {
          sendHtml(403, renderProject('Archived projects cannot be changed'));
          return;
        }
        if (pathname.endsWith('/default-priority')) {
          const priority = body.get('priority');
          if (!priorities.includes(priority)) {
            sendHtml(400, renderProject('Invalid task priority'));
            return;
          }
          setDefaultPriority.run(priority, id);
        } else {
          const name = (body.get('name') ?? '').trim();
          if (!name) {
            sendHtml(400, renderProject('Project name is required'));
            return;
          }
          renameProject.run(name, id);
        }
        response.writeHead(303, { Location: projectLocation(id, filter, priorityFilter, range) });
        response.end();
      } else if (request.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+\/(?:completion|rename|priority|due-date))?$/.test(pathname)) {
        const parts = pathname.split('/');
        const projectId = Number(parts[2]);
        const project = Number.isSafeInteger(projectId) ? findProject.get(projectId) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1>'));
          return;
        }
        const body = await readForm(request);
        const filter = taskFilter(body.get('filter'));
        const priorityFilter = priorityFilterValue(body.get('priorityFilter'));
        const range = readRange(body);
        const renderProject = error => projectPage(project, filter, priorityFilter, error, range);
        if (project.archived) {
          sendHtml(403, renderProject('Archived projects cannot be changed'));
          return;
        }
        if (parts.length === 4) {
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            sendHtml(400, renderProject('Task title is required'));
            return;
          }
          insertTask.run(projectId, title, project.default_priority);
        } else if (parts[5] === 'due-date') {
          const taskId = Number(parts[4]);
          const dueDate = (body.get('dueDate') ?? '').trim();
          if (dueDate && !isValidDueDate(dueDate)) {
            sendHtml(400, renderProject('Due date must be a valid YYYY-MM-DD date'));
            return;
          }
          if (!Number.isSafeInteger(taskId) || !setTaskDueDate.run(dueDate, taskId, projectId).changes) {
            sendHtml(404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (parts[5] === 'priority') {
          const taskId = Number(parts[4]);
          const priority = body.get('priority');
          if (!priorities.includes(priority)) {
            sendHtml(400, renderProject('Invalid task priority'));
            return;
          }
          if (!Number.isSafeInteger(taskId) || !setTaskPriority.run(priority, taskId, projectId).changes) {
            sendHtml(404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else if (parts[5] === 'rename') {
          const taskId = Number(parts[4]);
          const title = (body.get('title') ?? '').trim();
          if (!title) {
            sendHtml(400, renderProject('Task title is required'));
            return;
          }
          if (!Number.isSafeInteger(taskId) || !renameTask.run(title, taskId, projectId).changes) {
            sendHtml(404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
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
        response.writeHead(303, { Location: projectLocation(projectId, filter, priorityFilter, range) });
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
