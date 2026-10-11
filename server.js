import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
// Upgrade databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function serveFile(response, filename, contentType) {
  try {
    const content = await readFile(path.join(root, filename));
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return json(response, 200, database.prepare(`
      SELECT p.id, p.name, p.archived,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS totalCount,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completedCount
      FROM projects p ORDER BY p.id
    `).all().map((project) => ({ ...project, archived: Boolean(project.archived) })));
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived projects cannot be renamed' });

    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return json(response, 200, { id: projectId, name });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const archived = archiveMatch[2] === 'archive';
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?')
      .run(archived ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) return json(response, 404, { error: 'Project not found' });
    return json(response, 200, { id: Number(archiveMatch[1]), archived });
  }

  const projectTasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (projectTasksMatch && request.method === 'GET') {
    const projectId = Number(projectTasksMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    return json(response, 200, database.prepare(
      'SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id'
    ).all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }

  if (projectTasksMatch && request.method === 'POST') {
    const projectId = Number(projectTasksMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived projects cannot have new tasks' });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return json(response, 400, { error: 'Task title is required' });
      const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return json(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project?.archived) return json(response, 409, { error: 'Archived project tasks cannot be changed' });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return json(response, 400, { error: 'Invalid request body' });
      }
      const task = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?')
        .get(taskId, projectId);
      if (!task) return json(response, 404, { error: 'Task not found' });

      if (Object.hasOwn(input, 'title')) {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
        return json(response, 200, { id: taskId, projectId, title, completed: Boolean(task.completed) });
      }
      if (typeof input.completed !== 'boolean') return json(response, 400, { error: 'Completion state is required' });
      database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
        .run(input.completed ? 1 : 0, taskId, projectId);
      return json(response, 200, { id: taskId, projectId, completed: input.completed });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  if (request.method === 'GET' && url.pathname === '/') {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return serveFile(response, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    return serveFile(response, 'styles.css', 'text/css; charset=utf-8');
  }
  if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }

  response.writeHead(404);
  response.end('Not found');
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
