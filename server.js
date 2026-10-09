import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
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
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJson = (task) => ({ ...task, completed: Boolean(task.completed) });
const page = readFileSync(new URL('./public/index.html', import.meta.url));

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) throw new Error('Request too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && path === '/api/projects') {
      return json(response, 200, listProjects.all());
    }
    if (request.method === 'POST' && path === '/api/projects') {
      let input;
      try {
        input = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return json(response, 201, findProject.get(Number(result.lastInsertRowid)));
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const projectId = Number(tasksMatch[1]);
      const taskId = tasksMatch[2] ? Number(tasksMatch[2]) : null;
      if (!findProject.get(projectId)) return json(response, 404, { error: 'Project not found' });
      if (request.method === 'GET' && taskId === null) {
        return json(response, 200, listTasks.all(projectId).map(taskJson));
      }
      if ((request.method === 'POST' && taskId === null) || (request.method === 'PATCH' && taskId !== null)) {
        let input;
        try {
          input = await readJson(request);
        } catch {
          return json(response, 400, { error: 'Invalid JSON request' });
        }
        if (request.method === 'POST') {
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = insertTask.run(projectId, title);
          return json(response, 201, taskJson(findTask.get(projectId, Number(result.lastInsertRowid))));
        }
        if (!findTask.get(projectId, taskId)) return json(response, 404, { error: 'Task not found' });
        if (typeof input?.completed !== 'boolean') {
          return json(response, 400, { error: 'Completion must be a boolean' });
        }
        updateTask.run(Number(input.completed), projectId, taskId);
        return json(response, 200, taskJson(findTask.get(projectId, taskId)));
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(Number(projectMatch[1]));
      return project
        ? json(response, 200, project)
        : json(response, 404, { error: 'Project not found' });
    }
    if (request.method === 'GET' && (path === '/' || /^\/projects\/\d+$/.test(path))) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: 'Unable to complete request' });
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
