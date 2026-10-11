import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { projectListPage, projectPage, taskDirectoryPage } from './views.js';
import { matchesTask } from './task-filters.js';
import { directoryOrder, orderDirectoryTasks } from './task-directory-order.js';
import { projectExport } from './project-export.js';
import { parseProjectImport } from './project-import.js';
import { normalizeSearch, matchesSearch } from './search.js';
import { TASK_PRIORITIES } from './task-priorities.js';
import { normalizeDueDate, normalizeDueRange } from './task-dates.js';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)
`);
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
  database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
  database.exec(`
    BEGIN;
    ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    UPDATE tasks SET position = id;
    COMMIT;
  `);
}
database.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
  COMMIT;
`);
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
  WHERE projects.archived = ?
  GROUP BY projects.id ORDER BY projects.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const insertImportedProject = database.prepare('INSERT INTO projects (name, archived, default_task_priority) VALUES (?, ?, ?)');
const insertImportedTask = database.prepare(`
  INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const listDestinations = database.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const listDirectoryTasks = database.prepare(`
  SELECT tasks.*, projects.name AS project_name
  FROM tasks JOIN projects ON projects.id = tasks.project_id
  WHERE projects.archived = ?
  ORDER BY projects.id, tasks.position, tasks.id
`);
const insertTask = database.prepare(`
  INSERT INTO tasks (project_id, title, priority, position)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))
`);
const rememberCreatedTaskPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks WHERE id = ?
`);
const rememberDestinationPosition = database.prepare(`
  INSERT INTO task_project_positions (task_id, project_id, position)
  VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))
  ON CONFLICT (task_id, project_id) DO NOTHING
`);
const setTaskProject = database.prepare(`
  UPDATE tasks SET project_id = ?,
    position = (SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?)
  WHERE id = ? AND project_id = ?
`);
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?');
const setTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const setTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

function inTransaction(action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    action();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createTask(projectId, title, priority) {
  inTransaction(() => {
    const result = insertTask.run(projectId, title, priority, projectId);
    rememberCreatedTaskPosition.run(result.lastInsertRowid);
  });
}

function moveTask(taskId, sourceId, destinationId) {
  inTransaction(() => {
    // Keep positions even while tasks are away; returning never allocates a new one.
    rememberDestinationPosition.run(taskId, destinationId, destinationId);
    setTaskProject.run(destinationId, taskId, destinationId, taskId, sourceId);
  });
}

function importProject(name, project) {
  let projectId;
  inTransaction(() => {
    projectId = insertImportedProject.run(name, Number(project.archived), project.defaultPriority).lastInsertRowid;
    project.tasks.forEach((task, index) => {
      const result = insertImportedTask.run(projectId, task.title, Number(task.completed),
        task.priority, task.dueDate, task.notes, Number(task.deleted), index + 1);
      rememberCreatedTaskPosition.run(result.lastInsertRowid);
    });
  });
  return projectId;
}

function taskFilter(value) {
  return ['Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return TASK_PRIORITIES.includes(value) ? value : 'All';
}

function appliedDueRange(parameters) {
  const range = normalizeDueRange(parameters.get('dueFrom') || '', parameters.get('dueThrough') || '');
  return range.error ? { from: '', through: '' } : range;
}

function projectLocation(id, filter, priority, range, search = '') {
  const query = new URLSearchParams({ filter });
  if (priority !== 'All') query.set('priorityFilter', priority);
  if (range.from) query.set('dueFrom', range.from);
  if (range.through) query.set('dueThrough', range.through);
  if (search) query.set('search', search);
  return `/projects/${id}?${query}`;
}

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function renderProjects(filter, error = '', search = '', importForm = {}) {
  const projects = listProjects.all(filter === 'Archived' ? 1 : 0)
    .filter((project) => matchesSearch(project.name, search));
  return projectListPage(projects, error, filter, search, importForm);
}

function renderProject(project, filter, priority, errors = {}, range = { from: '', through: '' }, search = '') {
  const tasks = listTasks.all(project.id).filter((task) => matchesTask(task, filter, priority, range, search));
  return projectPage(project, tasks, filter, priority, errors, range, listDestinations.all(project.id), search);
}

function directoryState(parameters) {
  return {
    scope: projectFilter(parameters.get('scope')),
    filter: taskFilter(parameters.get('filter')),
    priority: priorityFilter(parameters.get('priorityFilter')),
    range: appliedDueRange(parameters),
    search: normalizeSearch(parameters.get('search')),
    order: directoryOrder(parameters.get('order')),
  };
}

function directoryTasks(state) {
  return listDirectoryTasks.all(state.scope === 'Archived' ? 1 : 0)
    .filter((task) => matchesTask(task, state.filter, state.priority, state.range, state.search));
}

function directoryLocation(state) {
  const query = new URLSearchParams({
    scope: state.scope, filter: state.filter, priorityFilter: state.priority,
    dueFrom: state.range.from, dueThrough: state.range.through, search: state.search,
  });
  if (state.order !== 'Original') query.set('order', state.order);
  return `/directory?${query}`;
}

function renderDirectory(state, errors = {}) {
  const tasks = directoryTasks(state);
  // Group before view sorting so owners retain project creation order.
  const owners = new Map();
  for (const task of tasks) {
    if (!owners.has(task.project_id)) {
      owners.set(task.project_id, {
        id: task.project_id, name: task.project_name, completedCount: 0, totalCount: 0,
      });
    }
    const owner = owners.get(task.project_id);
    owner.totalCount++;
    if (task.completed) owner.completedCount++;
  }
  return taskDirectoryPage(orderDirectoryTasks(tasks, state.order), [...owners.values()], state, errors);
}

function setDirectoryCompletion(state, completed) {
  // Resolve membership and update together, preserving all other task fields.
  if (state.scope !== 'Active' || state.filter === 'Deleted') return;
  inTransaction(() => {
    for (const task of directoryTasks(state)) {
      if (Boolean(task.completed) !== completed) {
        updateTask.run(Number(completed), task.id, task.project_id);
      }
    }
  });
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function send(response, status, content, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(content);
}

async function readForm(request, maximumBytes = 16384) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    const projectRoute = pathname.match(/^\/projects\/(?<projectId>[1-9]\d*)(?:\/tasks(?:\/(?<taskId>[1-9]\d*)(?:\/(?<taskAction>rename|priority|due-date|notes|move|delete|restore))?)?|\/(?<projectAction>archive|restore|rename|default-priority|due-range|export))?$/);
    if (request.method === 'GET' && pathname === '/health') {
      send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    } else if (request.method === 'GET' && pathname === '/') {
      send(response, 200, renderProjects(projectFilter(searchParams.get('filter')), '', normalizeSearch(searchParams.get('search'))));
    } else if (request.method === 'GET' && pathname === '/directory') {
      send(response, 200, renderDirectory(directoryState(searchParams)));
    } else if (request.method === 'POST' && ['/directory/complete', '/directory/reopen'].includes(pathname)) {
      const state = directoryState(await readForm(request));
      setDirectoryCompletion(state, pathname === '/directory/complete');
      redirect(response, directoryLocation(state));
    } else if (request.method === 'POST' && pathname === '/directory/due-range') {
      const form = await readForm(request);
      const state = directoryState(form);
      const range = normalizeDueRange(form.get('rangeFrom') || '', form.get('rangeThrough') || '');
      if (range.error) {
        send(response, 400, renderDirectory(state, {
          dueRange: range.error,
          rangeFrom: form.get('rangeFrom') || '',
          rangeThrough: form.get('rangeThrough') || '',
        }));
        return;
      }
      redirect(response, directoryLocation({ ...state, range }));
    } else if (request.method === 'POST' && pathname === '/projects/import') {
      const form = await readForm(request, 10 * 1024 * 1024);
      const json = form.get('json') ?? '';
      const name = form.get('importedName') ?? '';
      const project = name.trim() ? parseProjectImport(json) : null;
      if (!name.trim() || !project) {
        send(response, 400, renderProjects(projectFilter(form.get('filter')), '', normalizeSearch(form.get('search')), {
          json, name, error: name.trim() ? 'Invalid project JSON' : 'Project name is required',
        }));
        return;
      }
      const id = importProject(name.trim(), project);
      redirect(response, `/projects/${id}`);
    } else if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      const filter = projectFilter(form.get('filter'));
      if (!name) {
        send(response, 400, renderProjects(filter, 'Project name is required', normalizeSearch(form.get('search'))));
        return;
      }
      insertProject.run(name);
      redirect(response, '/');
    } else if (projectRoute) {
      const { projectId, taskId: taskIdValue, taskAction, projectAction } = projectRoute.groups;
      const id = Number(projectId);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        send(response, 404, 'Project not found', 'text/plain; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && projectAction === 'export') {
        response.setHeader('Content-Disposition', 'attachment; filename="workboard-project.json"');
        send(response, 200, JSON.stringify(projectExport(project, listTasks.all(id))), 'application/json; charset=utf-8');
      } else if (request.method === 'GET' && pathname === `/projects/${id}`) {
        send(response, 200, renderProject(project, taskFilter(searchParams.get('filter')), priorityFilter(searchParams.get('priorityFilter')), {}, appliedDueRange(searchParams), normalizeSearch(searchParams.get('search'))));
      } else if (request.method === 'POST' && projectAction === 'due-range') {
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const range = normalizeDueRange(form.get('rangeFrom') || '', form.get('rangeThrough') || '');
        if (range.error) {
          send(response, 400, renderProject(project, filter, priority, {
            dueRange: range.error,
            rangeFrom: form.get('rangeFrom') || '',
            rangeThrough: form.get('rangeThrough') || '',
          }, appliedDueRange(form), normalizeSearch(form.get('search'))));
          return;
        }
        redirect(response, projectLocation(id, filter, priority, range, normalizeSearch(form.get('search'))));
      } else if (request.method === 'POST' && projectAction === 'rename') {
        if (project.archived) {
          send(response, 403, 'Archived project', 'text/plain; charset=utf-8');
          return;
        }
        const form = await readForm(request);
        const name = (form.get('name') || '').trim();
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const appliedRange = appliedDueRange(form);
        if (!name) {
          send(response, 400, renderProject(project, filter, priority, { projectRename: 'Project name is required' }, appliedRange, normalizeSearch(form.get('search'))));
          return;
        }
        renameProject.run(name, id);
        redirect(response, projectLocation(id, filter, priority, appliedRange, normalizeSearch(form.get('search'))));
      } else if (request.method === 'POST' && projectAction === 'default-priority') {
        if (project.archived) {
          send(response, 403, 'Archived project', 'text/plain; charset=utf-8');
          return;
        }
        const form = await readForm(request);
        const newPriority = form.get('priority');
        if (!TASK_PRIORITIES.includes(newPriority)) {
          send(response, 400, 'Invalid task priority', 'text/plain; charset=utf-8');
          return;
        }
        setDefaultTaskPriority.run(newPriority, id);
        redirect(response, projectLocation(id, taskFilter(form.get('filter')), priorityFilter(form.get('priorityFilter')), appliedDueRange(form), normalizeSearch(form.get('search'))));
      } else if (request.method === 'POST' && ['archive', 'restore'].includes(projectAction)) {
        const archive = projectAction === 'archive';
        const form = await readForm(request);
        setProjectArchived.run(archive ? 1 : 0, id);
        const query = new URLSearchParams({ filter: archive ? 'Active' : 'Archived' });
        const search = normalizeSearch(form.get('search'));
        if (search) query.set('search', search);
        redirect(response, search ? `/?${query}` : archive ? '/' : '/?filter=Archived');
      } else if (request.method === 'POST' && pathname.includes('/tasks')) {
        if (project.archived) {
          send(response, 403, 'Archived project', 'text/plain; charset=utf-8');
          return;
        }
        const form = await readForm(request);
        const filter = taskFilter(form.get('filter'));
        const priority = priorityFilter(form.get('priorityFilter'));
        const appliedRange = appliedDueRange(form);
        if (taskIdValue) {
          const taskId = Number(taskIdValue);
          const task = Number.isSafeInteger(taskId) ? findTask.get(taskId, id) : undefined;
          if (!task) {
            send(response, 404, 'Task not found', 'text/plain; charset=utf-8');
            return;
          }
          if (task.deleted && taskAction !== 'restore') {
            send(response, 403, 'Deleted task', 'text/plain; charset=utf-8');
            return;
          }
          if (taskAction === 'delete' || taskAction === 'restore') {
            setTaskDeleted.run(taskAction === 'delete' ? 1 : 0, taskId, id);
          } else if (taskAction === 'move') {
            const destinationId = Number(form.get('destination'));
            const destination = Number.isSafeInteger(destinationId) ? findProject.get(destinationId) : undefined;
            if (!destination || destination.archived || destinationId === id) {
              send(response, 400, renderProject(project, filter, priority, {
                taskMove: { id: taskId, message: 'Choose an active destination project' },
              }, appliedRange, normalizeSearch(form.get('search'))));
              return;
            }
            moveTask(taskId, id, destinationId);
          } else if (taskAction === 'rename') {
            const title = (form.get('title') || '').trim();
            if (!title) {
              send(response, 400, renderProject(project, filter, priority, {
                taskRename: { id: taskId, message: 'Task title is required' },
              }, appliedRange, normalizeSearch(form.get('search'))));
              return;
            }
            renameTask.run(title, taskId, id);
          } else if (taskAction === 'due-date') {
            const dueDate = normalizeDueDate(form.get('dueDate') || '');
            if (dueDate === null) {
              send(response, 400, renderProject(project, filter, priority, {
                taskDueDate: { id: taskId, message: 'Due date must be a valid YYYY-MM-DD date' },
              }, appliedRange, normalizeSearch(form.get('search'))));
              return;
            }
            setTaskDueDate.run(dueDate, taskId, id);
          } else if (taskAction === 'notes') {
            setTaskNotes.run(form.get('notes') ?? '', taskId, id);
          } else if (taskAction === 'priority') {
            const newPriority = form.get('priority');
            if (!TASK_PRIORITIES.includes(newPriority)) {
              send(response, 400, 'Invalid task priority', 'text/plain; charset=utf-8');
              return;
            }
            setTaskPriority.run(newPriority, taskId, id);
          } else {
            updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, id);
          }
        } else {
          const title = (form.get('title') || '').trim();
          if (!title) {
            send(response, 400, renderProject(project, filter, priority, { taskCreation: 'Task title is required' }, appliedRange, normalizeSearch(form.get('search'))));
            return;
          }
          createTask(id, title, project.default_task_priority);
        }
        redirect(response, projectLocation(id, filter, priority, appliedRange, normalizeSearch(form.get('search'))));
      } else {
        send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      }
    } else {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      send(response, error.status || 500, error.status ? error.message : 'Internal server error', 'text/plain; charset=utf-8');
    } else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      database.close();
    });
  });
}
