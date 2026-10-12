import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
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
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_task_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
const listProjects = db.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total, COALESCE(SUM(tasks.completed), 0) AS completed
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
`);
const findProject = db.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const archiveProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultTaskPriority = db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const completeTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const prioritizeTask = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function validDueDate(value) {
  if (!value) return true;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182b3b; background: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 28px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin: 32px 0 16px; }
    .create { padding: 24px; background: white; border: 1px solid #d7e0e6; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input { min-width: 0; flex: 1 1 240px; padding: 12px; border: 1px solid #8495a3; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #175d84; color: white; cursor: pointer; font: inherit; font-weight: 600; }
    button:hover { background: #104663; }
    button:disabled { background: #70818c; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #ce8700; outline-offset: 3px; }
    [role="alert"] { color: #9b2424; margin: 0 0 16px; }
    ul { padding: 0; margin: 0; list-style: none; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: white; padding: 20px; margin-bottom: 12px; border: 1px solid #d7e0e6; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .project-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .summary { display: block; margin-top: 6px; color: #526775; }
    .empty { color: #526775; }
    .task { display: flex; align-items: center; gap: 12px; background: white; padding: 20px; margin-bottom: 12px; border: 1px solid #d7e0e6; border-radius: 10px; }
    .task label { margin: 0; overflow-wrap: anywhere; }
    .task input { flex: none; width: 20px; height: 20px; }
    .task-rename { padding: 20px; background: white; border: 1px solid #d7e0e6; border-radius: 10px; margin: -12px 0 12px; }
    select { padding: 10px; font: inherit; border: 1px solid #8495a3; border-radius: 6px; background: white; margin-bottom: 16px; }
    .back { margin-bottom: 24px; }
    @media (max-width: 480px) { main { margin-top: 32px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectList(error = '', filter = 'Active') {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0);
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="fields">
        <input id="project-name" name="name" type="text" autocomplete="off"${error ? ' aria-invalid="true"' : ''}>
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    <form method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.submit()">
        ${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    ${projects.length ? `<ul>${projects.map(project => `
      <li class="project" data-testid="project-row">
        <div><span class="project-name">${escapeHtml(project.name)}</span>
          <span class="summary" data-testid="project-summary">${project.completed}/${project.total} completed</span></div>
        <div class="project-actions">
          <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
        </div>
      </li>`).join('')}</ul>` : '<p class="empty">No projects to show.</p>'}
  `);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function dueRangeError(range) {
  if (!validDueDate(range.from) || !validDueDate(range.through)) {
    return 'Due range must use valid YYYY-MM-DD dates';
  }
  if (range.from && range.through && range.from > range.through) {
    return 'Due from must not be after Due through';
  }
  return '';
}

function readDueRange(params) {
  const range = {
    from: (params.get('dueFrom') || '').trim(),
    through: (params.get('dueThrough') || '').trim(),
  };
  return dueRangeError(range) ? { from: '', through: '' } : range;
}

function rangeFields(range) {
  return `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
}

function projectLocation(projectId, filter, priority, range = { from: '', through: '' }) {
  return `/projects/${projectId}?filter=${filter}${priority === 'All' ? '' : `&priorityFilter=${priority}`}${range.from ? `&dueFrom=${range.from}` : ''}${range.through ? `&dueThrough=${range.through}` : ''}`;
}

function projectPage(project, filter = 'All', error = '', renameError = '', taskRenameError = null, priority = 'All', dueDateError = null, range = { from: '', through: '' }, rangeError = '') {
  const tasks = listTasks.all(project.id).filter(task =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) &&
    ((!range.from && !range.through) || (task.due_date &&
      (!range.from || task.due_date >= range.from) &&
      (!range.through || task.due_date <= range.through))));
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="back" method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      ${renameError ? `<p role="alert">${escapeHtml(renameError)}</p>` : ''}
      <label for="new-project-name">New project name</label>
      <div class="fields">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${renameError ? ' aria-invalid="true"' : ''}${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/default-task-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
        ${['Low', 'Normal', 'High'].map(option => `<option${project.default_task_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="task-title">Task title</label>
      <div class="fields">
        <input id="task-title" name="title" type="text" autocomplete="off"${error ? ' aria-invalid="true"' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.submit()">
        ${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.submit()">
        ${['All', 'Low', 'Normal', 'High'].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      ${rangeFields(range)}
    </form>
    <form class="create" method="get" action="/projects/${project.id}/due-range">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priority}">
      ${rangeFields(range)}
      ${rangeError ? `<p role="alert">${escapeHtml(rangeError)}</p>` : ''}
      <label for="due-from">Due from</label>
      <input id="due-from" name="from" type="text" value="${escapeHtml(range.from)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="through" type="text" value="${escapeHtml(range.through)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `
      <li data-testid="task-row">
        <form class="task" method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields(range)}
          <input id="task-${task.id}" type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
          <label for="task-${task.id}">${escapeHtml(task.title)}</label>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields(range)}
          ${taskRenameError?.id === task.id ? '<p role="alert">Task title is required</p>' : ''}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="fields">
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${taskRenameError?.id === task.id ? ' aria-invalid="true"' : ''}${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </div>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields(range)}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.submit()">
            ${['Low', 'Normal', 'High'].map(option => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priority}">
          ${rangeFields(range)}
          ${dueDateError === task.id ? '<p role="alert">Due date must be a valid YYYY-MM-DD date</p>' : ''}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="fields">
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${dueDateError === task.id ? ' aria-invalid="true"' : ''}${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </div>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

async function readForm(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectList('', projectFilter(url.searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(request);
      if (!form) {
        sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
        return;
      }
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectList('Project name is required', projectFilter(form.get('filter'))));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const defaultMatch = /^\/projects\/([1-9]\d*)\/default-task-priority$/.exec(url.pathname);
    if (request.method === 'POST' && defaultMatch && Number.isSafeInteger(Number(defaultMatch[1]))) {
      const project = findProject.get(Number(defaultMatch[1]));
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        const range = readDueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range));
          return;
        }
        const priority = form.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', '', null, selectedPriority, null, range));
          return;
        }
        setDefaultTaskPriority.run(priority, project.id);
        response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, range) });
        response.end();
        return;
      }
    }
    const renameMatch = /^\/projects\/([1-9]\d*)\/rename$/.exec(url.pathname);
    if (request.method === 'POST' && renameMatch && Number.isSafeInteger(Number(renameMatch[1]))) {
      const project = findProject.get(Number(renameMatch[1]));
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        const range = readDueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, '', 'Archived project', null, selectedPriority, null, range));
          return;
        }
        const name = (form.get('name') || '').trim();
        if (!name) {
          sendHtml(response, 422, projectPage(project, filter, '', 'Project name is required', null, selectedPriority, null, range));
          return;
        }
        renameProject.run(name, project.id);
        response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, range) });
        response.end();
        return;
      }
    }
    const archiveMatch = /^\/projects\/([1-9]\d*)\/(archive|restore)$/.exec(url.pathname);
    if (request.method === 'POST' && archiveMatch && Number.isSafeInteger(Number(archiveMatch[1]))) {
      const result = archiveProject.run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
      if (result.changes) {
        response.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
        response.end();
        return;
      }
    }
    const taskMatch = /^\/projects\/([1-9]\d*)\/tasks(?:\/([1-9]\d*)(\/(?:rename|priority|due-date))?)?$/.exec(url.pathname);
    if (request.method === 'POST' && taskMatch && Number.isSafeInteger(Number(taskMatch[1])) &&
        (!taskMatch[2] || Number.isSafeInteger(Number(taskMatch[2])))) {
      const project = findProject.get(Number(taskMatch[1]));
      if (project) {
        const form = await readForm(request);
        if (!form) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        const filter = taskFilter(form.get('filter'));
        const selectedPriority = priorityFilter(form.get('priorityFilter'));
        const range = readDueRange(form);
        if (project.archived) {
          sendHtml(response, 403, projectPage(project, filter, 'Archived project', '', null, selectedPriority, null, range));
          return;
        }
        if (taskMatch[3]) {
          const taskId = Number(taskMatch[2]);
          if (!findTask.get(taskId, project.id)) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
          if (taskMatch[3] === '/due-date') {
            const dueDate = (form.get('dueDate') || '').trim();
            if (!validDueDate(dueDate)) {
              sendHtml(response, 422, projectPage(project, filter, '', '', null, selectedPriority, taskId, range));
              return;
            }
            setTaskDueDate.run(dueDate, taskId, project.id);
          } else if (taskMatch[3] === '/priority') {
            const priority = form.get('priority');
            if (!['Low', 'Normal', 'High'].includes(priority)) {
              sendHtml(response, 422, page('Invalid priority', '<p role="alert">Invalid task priority</p>'));
              return;
            }
            prioritizeTask.run(priority, taskId, project.id);
          } else {
            const title = (form.get('title') || '').trim();
            if (!title) {
              sendHtml(response, 422, projectPage(project, filter, '', '', { id: taskId }, selectedPriority, null, range));
              return;
            }
            renameTask.run(title, taskId, project.id);
          }
        } else if (taskMatch[2]) {
          const result = completeTask.run(form.get('completed') === '1' ? 1 : 0, Number(taskMatch[2]), project.id);
          if (!result.changes) {
            sendHtml(response, 404, page('Not found', '<h1>Task not found</h1>'));
            return;
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required', '', null, selectedPriority, null, range));
            return;
          }
          insertTask.run(project.id, title, project.default_task_priority);
        }
        response.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, range) });
        response.end();
        return;
      }
    }
    const rangeMatch = /^\/projects\/([1-9]\d*)\/due-range$/.exec(url.pathname);
    if (request.method === 'GET' && rangeMatch && Number.isSafeInteger(Number(rangeMatch[1]))) {
      const project = findProject.get(Number(rangeMatch[1]));
      if (project) {
        const filter = taskFilter(url.searchParams.get('filter'));
        const priority = priorityFilter(url.searchParams.get('priorityFilter'));
        const candidate = {
          from: (url.searchParams.get('from') || '').trim(),
          through: (url.searchParams.get('through') || '').trim(),
        };
        const error = dueRangeError(candidate);
        if (error) {
          sendHtml(response, 422, projectPage(project, filter, '', '', null, priority, null, readDueRange(url.searchParams), error));
        } else {
          response.writeHead(303, { Location: projectLocation(project.id, filter, priority, candidate) });
          response.end();
        }
        return;
      }
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match && Number.isSafeInteger(Number(match[1]))) {
      const project = findProject.get(Number(match[1]));
      if (project) {
        sendHtml(response, 200, projectPage(project, taskFilter(url.searchParams.get('filter')), '', '', null, priorityFilter(url.searchParams.get('priorityFilter')), null, readDueRange(url.searchParams)));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
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
