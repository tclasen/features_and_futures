import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(root, 'workboard.sqlite'));
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const findProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal'
)`);
try { database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = database.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskTitle = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid`);

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return send(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return send(response, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    insertProject.run(project.id, project.name, Date.now());
    return send(response, 201, project);
  }
  const tasksRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksRoute) {
    const projectId = decodeURIComponent(tasksRoute[1]);
    if (!findProject.get(projectId)) return send(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return send(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      if (findProject.get(projectId).archived) return send(response, 403, { error: 'Archived project' });
      let input = '';
      for await (const chunk of request) input += chunk;
      let data;
      try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(response, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), projectId, title, completed: 0 };
      insertTask.run(task.id, projectId, title, Date.now());
      return send(response, 201, task);
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskRoute && request.method === 'PATCH') {
    const projectId = decodeURIComponent(taskRoute[1]);
    const taskId = decodeURIComponent(taskRoute[2]);
    if (findProject.get(projectId)?.archived) return send(response, 403, { error: 'Archived project' });
    if (!findTask.get(taskId, projectId)) return send(response, 404, { error: 'Task not found' });
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    if (typeof data.completed === 'boolean') {
      updateTask.run(data.completed ? 1 : 0, taskId, projectId);
      return send(response, 200, { ok: true });
    }
    if (['Low', 'Normal', 'High'].includes(data.priority)) {
      updateTaskPriority.run(data.priority, taskId, projectId);
      return send(response, 200, { ok: true });
    }
    return send(response, 400, { error: 'Invalid task update' });
  }
  const taskRenameRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/rename$/);
  if (taskRenameRoute && request.method === 'PATCH') {
    const projectId = decodeURIComponent(taskRenameRoute[1]);
    const taskId = decodeURIComponent(taskRenameRoute[2]);
    const project = findProject.get(projectId);
    if (!project) return send(response, 404, { error: 'Project not found' });
    if (project.archived) return send(response, 403, { error: 'Archived project' });
    if (!findTask.get(taskId, projectId)) return send(response, 404, { error: 'Task not found' });
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return send(response, 400, { error: 'Task title is required' });
    updateTaskTitle.run(title, taskId, projectId);
    return send(response, 200, { id: taskId, projectId, title });
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
  if (renameRoute && request.method === 'PATCH') {
    const id = decodeURIComponent(renameRoute[1]);
    const project = findProject.get(id);
    if (!project) return send(response, 404, { error: 'Project not found' });
    if (project.archived) return send(response, 403, { error: 'Archived project' });
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return send(response, 400, { error: 'Project name is required' });
    updateProjectName.run(name, id);
    return send(response, 200, { id, name });
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (archiveRoute && request.method === 'PATCH') {
    const id = decodeURIComponent(archiveRoute[1]);
    if (!findProject.get(id)) return send(response, 404, { error: 'Project not found' });
    let input = '';
    for await (const chunk of request) input += chunk;
    let data;
    try { data = JSON.parse(input); } catch { return send(response, 400, { error: 'Invalid request' }); }
    if (typeof data.archived !== 'boolean') return send(response, 400, { error: 'Invalid archive state' });
    updateArchive.run(data.archived ? 1 : 0, id);
    return send(response, 200, { ok: true });
  }
  const detail = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && detail) {
    const project = findProject.get(decodeURIComponent(detail[1]));
    return project ? send(response, 200, project) : send(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    try { return send(response, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(response, 500, 'Application unavailable', 'text/plain; charset=utf-8'); }
  }
  send(response, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
