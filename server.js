import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT ?? 8080);
const dbPath = resolve(process.env.DB_PATH ?? './workboard.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const taskColumns = database.prepare("PRAGMA table_info(tasks)").all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const projectColumns = database.prepare("PRAGMA table_info(projects)").all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const appHtml = await readFile(new URL('./index.html', import.meta.url));
const appJs = await readFile(new URL('./app.js', import.meta.url));
const appCss = await readFile(new URL('./styles.css', import.meta.url));

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, listProjects.all().map((project) => ({ ...project, archived: Boolean(project.archived) })));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const data = await readJson(request);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, { ...project, archived: Boolean(project.archived) }) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    const data = await readJson(request);
    if (['Low', 'Normal', 'High'].includes(data?.defaultPriority)) {
      updateProjectDefaultPriority.run(data.defaultPriority, projectId);
      return sendJson(response, 200, { id: projectId, defaultPriority: data.defaultPriority });
    }
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const data = await readJson(request);
    if (typeof data?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state must be a boolean' });
    const result = setProjectArchived.run(data.archived ? 1 : 0, projectId);
    return result.changes ? sendJson(response, 200, { id: projectId, archived: data.archived }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot have new tasks' });
    const data = await readJson(request);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = addTask.run(projectId, title, project.defaultPriority);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultPriority });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const data = await readJson(request);
    if (typeof data?.title === 'string') {
      const title = data.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = renameTask.run(title, taskId, projectId);
      return result.changes ? sendJson(response, 200, { id: taskId, projectId, title }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof data?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return sendJson(response, 400, { error: 'Priority must be Low, Normal, or High' });
      const result = updateTaskPriority.run(data.priority, taskId, projectId);
      return result.changes ? sendJson(response, 200, { id: taskId, projectId, priority: data.priority }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof data?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be a boolean' });
    const result = updateTaskCompletion.run(data.completed ? 1 : 0, taskId, projectId);
    return result.changes ? sendJson(response, 200, { id: taskId, projectId, completed: data.completed }) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(appJs);
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return response.end(appCss);
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(appHtml);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
