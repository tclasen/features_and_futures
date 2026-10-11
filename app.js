import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate, normalizeDueRange } from './due-date.js';

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
const taskPriorities = ['Low', 'Normal', 'High'];
const priorityFilters = ['All', ...taskPriorities];

function readTaskFilters(parameters) {
  const completion = parameters.get('filter');
  const priority = parameters.get('priorityFilter');
  const range = normalizeDueRange(parameters.get('dueFrom') ?? '', parameters.get('dueThrough') ?? '');
  return {
    completion: taskFilters.includes(completion) ? completion : 'All',
    priority: priorityFilters.includes(priority) ? priority : 'All',
    dueFrom: range.dueFrom ?? '',
    dueThrough: range.dueThrough ?? '',
  };
}

function projectPath(projectId, filters) {
  const parameters = new URLSearchParams();
  if (filters.completion !== 'All') parameters.set('filter', filters.completion);
  if (filters.priority !== 'All') parameters.set('priorityFilter', filters.priority);
  if (filters.dueFrom) parameters.set('dueFrom', filters.dueFrom);
  if (filters.dueThrough) parameters.set('dueThrough', filters.dueThrough);
  const query = parameters.toString();
  return `/projects/${projectId}${query ? `?${query}` : ''}`;
}

function dueRangeFields(filters) {
  return ['dueFrom', 'dueThrough'].filter((name) => filters[name])
    .map((name) => `<input type="hidden" name="${name}" value="${filters[name]}">`).join('\n');
}

function taskFilterFields(filters) {
  return `<input type="hidden" name="filter" value="${filters.completion}">
      <input type="hidden" name="priorityFilter" value="${filters.priority}">
      ${dueRangeFields(filters)}`;
}

function projectPage(project, tasks, filters, error = '') {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form method="post" action="/projects/${project.id}/rename" class="create-form project-rename">
      ${taskFilterFields(filters)}
      <label for="new-project-name">New project name</label>
      <div class="input-group"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
    </form>
    <form method="post" action="/projects/${project.id}/default-priority" class="default-priority">
      ${taskFilterFields(filters)}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${taskPriorities.map((priority) => `<option${project.default_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form method="post" action="/projects/${project.id}/tasks" class="create-form task-create">
      ${taskFilterFields(filters)}
      <label for="task-title">Task title</label>
      <div class="input-group"><input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <form method="get" action="/projects/${project.id}" class="task-filter">
      ${dueRangeFields(filters)}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${taskFilters.map((option) => `<option${filters.completion === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${priorityFilters.map((option) => `<option${filters.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form method="post" action="/projects/${project.id}/due-range" class="due-range">
      <input type="hidden" name="filter" value="${filters.completion}">
      <input type="hidden" name="priorityFilter" value="${filters.priority}">
      <input type="hidden" name="appliedDueFrom" value="${filters.dueFrom}">
      <input type="hidden" name="appliedDueThrough" value="${filters.dueThrough}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="dueFrom" type="text" value="${filters.dueFrom}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="dueThrough" type="text" value="${filters.dueThrough}">
      <button type="submit">Apply due range</button>
    </form>
    <section aria-label="Tasks" class="project-list">
      ${tasks.map((task) => `<div data-testid="task-row" class="task-row">
        <span>${escapeHtml(task.title)}</span>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
          ${taskFilterFields(filters)}
          <input type="checkbox" name="completed" value="1" aria-label="${escapeHtml(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          ${taskFilterFields(filters)}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${taskPriorities.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename" class="task-rename">
          ${taskFilterFields(filters)}
          <label for="new-task-title-${task.id}">New task title</label>
          <div class="input-group"><input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button></div>
        </form>
        <form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date" class="task-due-date">
          ${taskFilterFields(filters)}
          <label for="task-due-date-${task.id}">Task due date</label>
          <div class="input-group"><input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${project.archived ? ' disabled' : ''}>
          <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button></div>
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
  // A project default affects only future tasks; existing task priorities stay intact.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
  }
  database.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id)`);
  // Preserve existing tasks and initialize each priority independently.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  const listProjects = database.prepare(`SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id`);
  const findProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
  const listTasks = database.prepare(`SELECT id, title, completed, priority, due_date FROM tasks
    WHERE project_id = ? AND (? IS NULL OR completed = ?)
      AND (? IS NULL OR priority = ?)
      AND (? = '' OR due_date >= ?)
      AND (? = '' OR (due_date != '' AND due_date <= ?)) ORDER BY id`);
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
  const updateCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
  const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
  const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
  const updateDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
  function tasksFor(projectId, filters) {
    const completed = filters.completion === 'All' ? null : Number(filters.completion === 'Completed');
    const priority = filters.priority === 'All' ? null : filters.priority;
    return listTasks.all(projectId, completed, completed, priority, priority,
      filters.dueFrom, filters.dueFrom, filters.dueThrough, filters.dueThrough);
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
      const match = /^\/projects\/([1-9]\d*)(?:\/rename|\/default-priority|\/due-range|\/tasks(?:\/([1-9]\d*)\/(completion|rename|priority|due-date))?)?$/.exec(url.pathname);
      if (match) {
        const id = Number(match[1]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (project) {
          if (request.method === 'GET' && url.pathname === `/projects/${id}`) {
            const filters = readTaskFilters(url.searchParams);
            return send(200, projectPage(project, tasksFor(id, filters), filters));
          }
          if (request.method === 'POST' && url.pathname !== `/projects/${id}`) {
            const form = await readForm(request);
            const filters = readTaskFilters(form);
            if (url.pathname === `/projects/${id}/due-range`) {
              const range = normalizeDueRange(form.get('dueFrom') ?? '', form.get('dueThrough') ?? '');
              if (range.error) {
                const previous = normalizeDueRange(form.get('appliedDueFrom') ?? '', form.get('appliedDueThrough') ?? '');
                filters.dueFrom = previous.dueFrom ?? '';
                filters.dueThrough = previous.dueThrough ?? '';
                return send(400, projectPage(project, tasksFor(id, filters), filters, range.error));
              }
              response.writeHead(303, { Location: projectPath(id, { ...filters, ...range }) });
              return response.end();
            }
            if (project.archived) {
              return send(409, projectPage(project, tasksFor(id, filters), filters, 'Archived project is read-only'));
            }
            if (url.pathname === `/projects/${id}/rename`) {
              const name = (form.get('name') ?? '').trim();
              if (!name) return send(400, projectPage(project, tasksFor(id, filters), filters, 'Project name is required'));
              renameProject.run(name, id);
            } else if (url.pathname === `/projects/${id}/default-priority`) {
              const priority = form.get('priority');
              if (!taskPriorities.includes(priority)) {
                return send(400, projectPage(project, tasksFor(id, filters), filters, 'Task priority is invalid'));
              }
              updateDefaultPriority.run(priority, id);
            } else if (match[2]) {
              const taskId = Number(match[2]);
              if (!Number.isSafeInteger(taskId)) {
                return send(404, page('Not found', '<h1>Task not found</h1>'));
              }
              let result;
              if (match[3] === 'rename') {
                const title = (form.get('title') ?? '').trim();
                if (!title) return send(400, projectPage(project, tasksFor(id, filters), filters, 'Task title is required'));
                result = renameTask.run(title, taskId, id);
              } else if (match[3] === 'priority') {
                const priority = form.get('priority');
                if (!taskPriorities.includes(priority)) {
                  return send(400, projectPage(project, tasksFor(id, filters), filters, 'Task priority is invalid'));
                }
                result = updatePriority.run(priority, taskId, id);
              } else if (match[3] === 'due-date') {
                const dueDate = normalizeDueDate(form.get('dueDate') ?? '');
                if (dueDate === null) {
                  return send(400, projectPage(project, tasksFor(id, filters), filters, 'Due date must be a valid YYYY-MM-DD date'));
                }
                result = updateDueDate.run(dueDate, taskId, id);
              } else {
                result = updateCompletion.run(Number(form.get('completed') === '1'), taskId, id);
              }
              if (!result.changes) return send(404, page('Not found', '<h1>Task not found</h1>'));
            } else {
              const title = (form.get('title') ?? '').trim();
              if (!title) return send(400, projectPage(project, tasksFor(id, filters), filters, 'Task title is required'));
              insertTask.run(id, title, project.default_priority);
            }
            response.writeHead(303, { Location: projectPath(id, filters) });
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
