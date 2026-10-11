import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { renderProjects, renderProject, renderNotFound } from './views.js';
import { isValidDueDate, dueRangeError, matchesDueRange } from './dates.js';

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
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.position ORDER BY projects.position
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, priority) VALUES (?, ?, ?, ?)');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(filter = 'Active', error = '') {
  return renderProjects(listProjects.all(filter === 'Archived' ? 1 : 0), filter, error);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function readDueRange(params) {
  const from = (params.get('dueFrom') ?? '').trim();
  const through = (params.get('dueThrough') ?? '').trim();
  return dueRangeError(from, through) ? { from: '', through: '' } : { from, through };
}

function renderFilteredProject(project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const tasks = listTasks.all(project.id).filter((task) =>
    (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
    (priority === 'All' || task.priority === priority) && matchesDueRange(task.due_date, range));
  return renderProject(project, tasks, filter, error, priority, range);
}

function filteredProjectLocation(project, filter, priority, range = { from: '', through: '' }) {
  const params = new URLSearchParams({ filter });
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  return `/projects/${project.id}?${params}`;
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
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
      sendHtml(response, 200, projectsPage(projectFilter(searchParams.get('filter'))));
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage(projectFilter(form.get('filter')), 'Project name is required'));
        return;
      }
      insertProject.run(randomUUID(), name);
      response.writeHead(303, { Location: '/' });
      response.end();
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
      const range = readDueRange(form);
      const projectPage = (...args) => renderFilteredProject(...args, range);
      const projectLocation = (...args) => filteredProjectLocation(...args, range);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
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
      const range = readDueRange(form);
      const projectPage = (...args) => renderFilteredProject(...args, range);
      const projectLocation = (...args) => filteredProjectLocation(...args, range);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
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
      const archived = archiveMatch[2] === 'archive';
      const result = updateProjectArchive.run(archived ? 1 : 0, archiveMatch[1]);
      if (!result.changes) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      redirect(response, `/?filter=${archived ? 'Active' : 'Archived'}`);
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
        sendHtml(response, 422, renderFilteredProject(project, filter, error, priority, readDueRange(form)));
        return;
      }
      redirect(response, filteredProjectLocation(project, filter, priority, { from, through }));
      return;
    }
    const match = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      sendHtml(response, project ? 200 : 404, project ? renderFilteredProject(project, taskFilter(searchParams.get('filter')), '', priorityFilter(searchParams.get('priorityFilter')), readDueRange(searchParams)) : renderNotFound());
      return;
    }
    const taskMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/tasks(?:\/([a-zA-Z0-9-]+)(?:\/(rename|priority|due-date))?)?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      const form = await readForm(request);
      const range = readDueRange(form);
      const projectPage = (...args) => renderFilteredProject(...args, range);
      const projectLocation = (...args) => filteredProjectLocation(...args, range);
      const filter = taskFilter(form.get('filter'));
      const priority = priorityFilter(form.get('priorityFilter'));
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, filter, 'Archived projects cannot be changed', priority));
        return;
      }
      if (taskMatch[2]) {
        let result;
        if (taskMatch[3] === 'rename') {
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
        insertTask.run(randomUUID(), project.id, title, project.default_task_priority);
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
