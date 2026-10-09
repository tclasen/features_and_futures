import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
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
  CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
`);

function taskData(task) {
  return { ...task, completed: Boolean(task.completed) };
}

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]],
  ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/style.css', import.meta.url))]],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body is too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (path === '/api/projects' && request.method === 'GET') {
      return json(response, 200, database.prepare('SELECT id, name FROM projects ORDER BY id').all());
    }
    if (path === '/api/projects' && request.method === 'POST') {
      let input;
      try {
        input = await readJson(request);
      } catch {
        return json(response, 400, { error: 'Invalid JSON request' });
      }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(response, 201, { id: Number(result.lastInsertRowid), name });
    }
    const tasksMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (tasksMatch) {
      const [, projectId, taskId] = tasksMatch;
      const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (!taskId && request.method === 'GET') {
        const tasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
        return json(response, 200, tasks.map(taskData));
      }
      if ((!taskId && request.method === 'POST') || (taskId && request.method === 'PATCH')) {
        let input;
        try {
          input = await readJson(request);
        } catch {
          return json(response, 400, { error: 'Invalid JSON request' });
        }
        if (!taskId) {
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return json(response, 400, { error: 'Task title is required' });
          const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
          return json(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
        }
        const task = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
        if (!task) return json(response, 404, { error: 'Task not found' });
        if (typeof input?.completed !== 'boolean') return json(response, 400, { error: 'Completion must be a boolean' });
        database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(Number(input.completed), taskId, projectId);
        return json(response, 200, { ...taskData(task), completed: input.completed });
      }
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === 'GET' && projectMatch) {
      const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectMatch[1]);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }
    const asset = assets.get(path) || (/^\/projects\/\d+$/.test(path) ? assets.get('/') : undefined);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset[0] });
      return response.end(asset[1]);
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
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
