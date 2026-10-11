import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { renderProjects, renderProject, renderNotFound } from './views.js';

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
const listProjects = database.prepare(`
  SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
  FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  WHERE projects.archived = ?
  GROUP BY projects.position ORDER BY projects.position
`);
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateProjectArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY position');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title) VALUES (?, ?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

function projectFilter(value) {
  return value === 'Archived' ? 'Archived' : 'Active';
}

function projectsPage(filter = 'Active', error = '') {
  return renderProjects(listProjects.all(filter === 'Archived' ? 1 : 0), filter, error);
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(project, filter = 'All', error = '') {
  const tasks = listTasks.all(project.id).filter((task) =>
    filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  return renderProject(project, tasks, filter, error);
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
    const match = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      sendHtml(response, project ? 200 : 404, project ? projectPage(project, taskFilter(searchParams.get('filter'))) : renderNotFound());
      return;
    }
    const taskMatch = pathname.match(/^\/projects\/([a-zA-Z0-9-]+)\/tasks(?:\/([a-zA-Z0-9-]+))?$/);
    if (request.method === 'POST' && taskMatch) {
      const project = findProject.get(taskMatch[1]);
      if (!project) {
        sendHtml(response, 404, renderNotFound());
        return;
      }
      if (project.archived) {
        sendHtml(response, 403, projectPage(project, taskFilter(searchParams.get('filter')), 'Archived projects cannot be changed'));
        return;
      }
      const form = await readForm(request);
      const filter = taskFilter(form.get('filter'));
      if (taskMatch[2]) {
        const completed = form.get('completed') === '1' ? 1 : 0;
        const result = updateTask.run(completed, project.id, taskMatch[2]);
        if (!result.changes) {
          sendHtml(response, 404, renderNotFound());
          return;
        }
      } else {
        const title = (form.get('title') ?? '').trim();
        if (!title) {
          sendHtml(response, 422, projectPage(project, filter, 'Task title is required'));
          return;
        }
        insertTask.run(randomUUID(), project.id, title);
      }
      redirect(response, `/projects/${project.id}?filter=${filter}`);
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
