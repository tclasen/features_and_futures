import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { renderProjects, renderProject, renderDirectory, renderNotFound } from './views.js';
import { isValidDueDate, dueRangeError, matchesDueRange } from './dates.js';
import { normalizeSearch, matchesSearch } from './search.js';
import { exportProject } from './export.js';
import { parseProjectImport } from './import.js';
import { directoryOrder, orderDirectoryTasks } from './directory-order.js';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? './data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_order ON tasks(project_id, position);
`);
// Upgrade databases created before project archiving was introduced.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
// Existing tasks retain their data and receive the same default as new tasks.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
// Project defaults affect only tasks created after the default is saved.
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
// An empty string represents an optional, unset calendar date.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
// Notes are plain text; upgrades initialize only this new field.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
// Soft deletion preserves task data and all remembered ordering positions.
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Remember positions even while a task belongs elsewhere. Seed legacy tasks in
// their current order; restarting must never overwrite an established position.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
  WHERE projects.archived = ?
  GROUP BY projects.position ORDER BY projects.position
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
const insertImportedProject = database.prepare('INSERT INTO projects (id, name, archived, default_task_priority) VALUES (?, ?, ?, ?)');
const insertImportedTask = database.prepare(`
  INSERT INTO tasks (id, project_id, title, completed, priority, due_date, notes, deleted)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const listTasks = database.prepare(`
  SELECT tasks.id, title, completed, priority, due_date, notes, deleted
  FROM tasks JOIN task_project_positions AS ordering
    ON ordering.task_id = tasks.id AND ordering.project_id = tasks.project_id
  WHERE tasks.project_id = ? ORDER BY ordering.position
`);
const listDirectoryTasks = database.prepare(`
  SELECT tasks.id, tasks.title, tasks.completed, tasks.priority, tasks.due_date, tasks.notes, tasks.deleted,
    projects.id AS project_id, projects.name AS project_name
  FROM tasks JOIN projects ON projects.id = tasks.project_id
  JOIN task_project_positions AS ordering
    ON ordering.task_id = tasks.id AND ordering.project_id = tasks.project_id
  WHERE projects.archived = ? ORDER BY projects.position, ordering.position
`);
const findTask = database.prepare('SELECT deleted FROM tasks WHERE project_id = ? AND id = ?');
const updateTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, priority) VALUES (?, ?, ?, ?)');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY position');
const updateTaskOwner = database.prepare('UPDATE tasks SET project_id = ? WHERE project_id = ? AND id = ?');
const rememberTaskPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT ?, ?, COALESCE(MAX(position), 0) + 1
  FROM task_project_positions WHERE project_id = ?
  HAVING NOT EXISTS (
    SELECT 1 FROM task_project_positions WHERE task_id = ? AND project_id = ?
  )
`);

function transaction(operation) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function rememberPosition(taskId, projectId) {
  rememberTaskPosition.run(taskId, projectId, projectId, taskId, projectId);
}

function createTask(taskId, projectId, title, priority) {
  transaction(() => {
    insertTask.run(taskId, projectId, title, priority);
    rememberPosition(taskId, projectId);
  });
}

function importProject(name, project) {
  return transaction(() => {
    const projectId = randomUUID();
    insertImportedProject.run(projectId, name, Number(project.archived), project.defaultPriority);
    for (const task of project.tasks) {
      const taskId = randomUUID();
      insertImportedTask.run(taskId, projectId, task.title, Number(task.completed), task.priority,
        task.dueDate, task.notes, Number(task.deleted));
      rememberPosition(taskId, projectId);
    }
    return projectId;
  });
}

function moveTask(destinationId, sourceId, taskId) {
  return transaction(() => {
    const result = updateTaskOwner.run(destinationId, sourceId, taskId);
    if (result.changes) rememberPosition(taskId, destinationId);
    return result;
  });
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(filter = 'Active', error = '', query = '', importValues = {}) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter((project) => matchesSearch(project.name, query));
  return renderProjects(projects, filter, error, query, importValues);
}

function projectsLocation(filter, query) {
  return `/?${new URLSearchParams({ filter, query })}`;
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function readDueRange(params) {
  const from = (params.get('dueFrom') ?? '').trim();
  const through = (params.get('dueThrough') ?? '').trim();
  return dueRangeError(from, through) ? { from: '', through: '' } : { from, through };
}

function matchesTask(task, filter, priority, range, query) {
  return (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed'))) &&
    (priority === 'All' || task.priority === priority) && matchesDueRange(task.due_date, range) &&
    matchesSearch(task.title, query);
}

function directoryState(params) {
  return {
    scope: projectFilter(params.get('scope')),
    order: directoryOrder(params.get('order')),
    filter: taskFilter(params.get('filter')),
    priority: priorityFilter(params.get('priorityFilter')),
    range: readDueRange(params),
    query: normalizeSearch(params.get('query')),
  };
}

function directoryTasks(state) {
  const tasks = listDirectoryTasks.all(state.scope === 'Archived' ? 1 : 0)
    .filter((task) => matchesTask(task, state.filter, state.priority, state.range, state.query));
  return orderDirectoryTasks(tasks, state.order);
}

function directoryPage(state, error = '') {
  return renderDirectory(directoryTasks(state), state, error);
}

function directoryLocation(state) {
  return `/directory?${new URLSearchParams({
    scope: state.scope, filter: state.filter, priorityFilter: state.priority, order: state.order,
    dueFrom: state.range.from, dueThrough: state.range.through, query: state.query,
  })}`;
}

function setDirectoryCompletion(state, completed) {
  // Resolve the matching set and save it in one transaction, using exactly the
  // same matching rules as the view. Only completion is changed.
  transaction(() => {
    for (const task of directoryTasks(state)) {
      if (Boolean(task.completed) !== completed) {
        updateTask.run(Number(completed), task.project_id, task.id);
      }
    }
  });
}

function renderFilteredProject(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, query = '') {
  const tasks = listTasks.all(project.id).filter((task) => matchesTask(task, filter, priority, range, query));
  return renderProject(project, tasks, filter, error, priority, range, listDestinations.all(project.id), query);
}

function filteredProjectLocation(project, filter, priority, range = { from: '', through: '' }, query = '') {
  const params = new URLSearchParams({ filter });
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  if (query) params.set('query', query);
  return `/projects/${project.id}?${params}`;
}

// Carry applied view state through edits and validation failures alike.
function projectViewState(form) {
  const range = readDueRange(form);
  const query = normalizeSearch(form.get('query'));
  return {
    filter: taskFilter(form.get('filter')),
    priority: priorityFilter(form.get('priorityFilter')),
    projectPage: (...args) => renderFilteredProject(...args, range, query),
    projectLocation: (...args) => filteredProjectLocation(...args, range, query),
  };
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request, maxBytes = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectsPage(projectFilter(searchParams.get('filter')), '', normalizeSearch(searchParams.get('query'))));
      return;
    }
    if (request.method === 'GET' && pathname === '/directory') {
      sendHtml(response, 200, directoryPage(directoryState(searchParams)));
      return;
    }
    if (request.method === 'POST' && ['/directory/complete', '/directory/reopen'].includes(pathname)) {
      const state = directoryState(await readForm(request));
      if (state.scope === 'Archived' || state.filter === 'Deleted') {
        sendHtml(response, 403, directoryPage(state, 'Only live tasks in active projects can be changed'));
        return;
      }
      setDirectoryCompletion(state, pathname === '/directory/complete');
      redirect(response, directoryLocation(state));
      return;
    }
    if (request.method === 'POST' && pathname === '/directory/due-range') {
      const form = await readForm(request);
      const state = directoryState(form);
      const from = (form.get('rangeFrom') ?? '').trim();
      const through = (form.get('rangeThrough') ?? '').trim();
      const error = dueRangeError(from, through);
      if (error) {
        sendHtml(response, 422, directoryPage(state, error));
        return;
      }
      redirect(response, directoryLocation({ ...state, range: { from, through } }));
      return;
    }
    if (request.method === 'POST' && pathname === '/imports/projects') {
      const form = await readForm(request, Infinity);
      const importValues = { json: form.get('json') ?? '', name: form.get('name') ?? '' };
      const name = importValues.name.trim();
      const project = name ? parseProjectImport(importValues.json) : null;
      if (!name || !project) {
        sendHtml(response, 422, projectsPage(projectFilter(form.get('filter')),
          !name ? 'Project name is required' : 'Invalid project JSON',
          normalizeSearch(form.get('query')), importValues));
        return;
      }
      const projectId = importProject(name, project);
      redirect(response, `/projects/${projectId}`);
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage(projectFilter(form.get('filter')), 'Project name is required', normalizeSearch(form.get('query'))));
        return;
      }
      insertProject.run(randomUUID(), name);
      redirect(response, projectsLocation(projectFilter(form.get('filter')), normalizeSearch(form.get('query'))));
      return;
    }
    const exportMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/export$/);
    if (request.method === 'GET' && exportMatch) {
      const project = findProject.get(exportMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
      });
      response.end(JSON.stringify(exportProject(project, listTasks.all(project.id)), null, 2));
      return;
    }
    const renameMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/rename$/);
    if (request.method === 'POST' && renameMatch) {
      const project = findProject.get(renameMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const { projectPage, projectLocation, filter, priority } = projectViewState(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority));
        return;
      }
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 422, projectPage(project, filter, 'Project name is required', priority));
        return;
      }
      renameProject.run(name, project.id);
      redirect(response, projectLocation(project, filter, priority));
      return;
    }
    const defaultPriorityMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/default-priority$/);
    if (request.method === 'POST' && defaultPriorityMatch) {
      const project = findProject.get(defaultPriorityMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const { projectPage, projectLocation, filter, priority } = projectViewState(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority));
        return;
      }
      const defaultPriority = form.get('priority');
      if (!['Low', 'Normal', 'High'].includes(defaultPriority)) {
        sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', priority));
        return;
      }
      updateProjectDefaultPriority.run(defaultPriority, project.id);
      redirect(response, projectLocation(project, filter, priority));
      return;
    }
    const archiveMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/(archive|restore)$/);
    if (request.method === 'POST' && archiveMatch) {
      const form = await readForm(request);
      const archived = archiveMatch[2] === 'archive';
      const result = updateProjectArchive.run(archived ? 1 : 0, archiveMatch[1]);
      if (!result.changes) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      redirect(response, projectsLocation(archived ? 'Active' : 'Archived', normalizeSearch(form.get('query'))));
      return;
    }
    const searchMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/search$/);
    if (request.method === 'POST' && searchMatch) {
      const project = findProject.get(searchMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      redirect(response, filteredProjectLocation(project, taskFilter(form.get('filter')),
        priorityFilter(form.get('priorityFilter')), readDueRange(form), normalizeSearch(form.get('searchQuery'))));
      return;
    }
    const rangeMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/due-range$/);
    if (request.method === 'POST' && rangeMatch) {
      const project = findProject.get(rangeMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      const from = (form.get('rangeFrom') ?? '').trim();
      const through = (form.get('rangeThrough') ?? '').trim();
      const error = dueRangeError(from, through);
      if (error) {
        sendHtml(response, 422, renderFilteredProject(project, filter, error, priority, readDueRange(form), normalizeSearch(form.get('query'))));
        return;
      }
      redirect(response, filteredProjectLocation(project, filter, priority, { from, through }, normalizeSearch(form.get('query'))));
      return;
    }
    const match = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      sendHtml(response, project ? 200 : 404, project ? renderFilteredProject(project, taskFilter(searchParams.get('filter')), '', priorityFilter(searchParams.get('priorityFilter')), readDueRange(searchParams), normalizeSearch(searchParams.get('query'))) : renderNotFound());
      return;
    }
    const taskMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/tasks(?:\/([a-zA-Z0-9-]+)(?:\/(rename|priority|due-date|move|notes|delete|restore))?)?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const { projectPage, projectLocation, filter, priority } = projectViewState(form);
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority));
        return;
      }
      if (taskMatch[2]) {
        const task = findTask.get(project.id, taskMatch[2]);
        if (!task) {
          sendHtml(response, 404, renderNotFound());
          return;
        }
        const action = taskMatch[3];
        if (task.deleted && action !== 'restore') {
          sendHtml(response, 403, projectPage(project, filter, 'Deleted tasks cannot be changed', priority));
          return;
        }
        let result;
        if (action === 'delete' || action === 'restore') {
          result = updateTaskDeleted.run(action === 'delete' ? 1 : 0, project.id, taskMatch[2]);
        } else if (action === 'move') {
          const destination = findProject.get(form.get('destination') ?? '');
          if (!destination || destination.archived || destination.id === project.id) {
            sendHtml(response, 422, projectPage(project, filter, 'Choose an active destination project', priority));
            return;
          }
          result = moveTask(destination.id, project.id, taskMatch[2]);
        } else if (taskMatch[3] === 'rename') {
          const title = (form.get('title') ?? '').trim();
          if (!title) {
            sendHtml(response, 422, projectPage(project, filter, 'Task title is required', priority));
            return;
          }
          result = renameTask.run(title, project.id, taskMatch[2]);
        } else if (taskMatch[3] === 'priority') {
          const taskPriority = form.get('priority');
          if (!['Low', 'Normal', 'High'].includes(taskPriority)) {
            sendHtml(response, 422, projectPage(project, filter, 'Invalid task priority', priority));
            return;
          }
          result = updateTaskPriority.run(taskPriority, project.id, taskMatch[2]);
        } else if (taskMatch[3] === 'notes') {
          result = updateTaskNotes.run(form.get('notes') ?? '', project.id, taskMatch[2]);
        } else if (taskMatch[3] === 'due-date') {
          const dueDate = (form.get('dueDate') ?? '').trim();
          if (dueDate && !isValidDueDate(dueDate)) {
            sendHtml(response, 422, projectPage(project, filter, 'Due date must be a valid YYYY-MM-DD date', priority));
            return;
          }
          result = updateTaskDueDate.run(dueDate, project.id, taskMatch[2]);
        } else {
          result = updateTask.run(form.get('completed') === '1' ? 1 : 0, project.id, taskMatch[2]);
        }
        if (!result.changes) {
          sendHtml(response, 404, renderNotFound());
          return;
        }
      } else {
        const title = (form.get('title') ?? '').trim();
        if (!title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required', priority));
          return;
        }
        createTask(randomUUID(), project.id, title, project.default_task_priority);
      }
      redirect(response, projectLocation(project, filter, priority));
      return;
    }
    sendHtml(response, 404, renderNotFound());
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) {
      response.writeHead(error.status ?? 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end(error.status ? error.message : 'Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
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
