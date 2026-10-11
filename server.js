import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
if (!database.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const getProject = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const listProjects = database.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const root = path.dirname(new URL(import.meta.url).pathname);
const send = (res, status, body, contentType = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(listProjects.all()));
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (renameRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const id = Number(renameRoute[1]);
      const project = getProject.get(id);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
      renameProject.run(name, id);
      return send(res, 200, JSON.stringify(getProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived;
      if (typeof archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
      const id = Number(archiveRoute[1]);
      const result = setProjectArchived.run(archived ? 1 : 0, id);
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      return send(res, 200, JSON.stringify(getProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET' && !taskRoute[2]) return send(res, 200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !taskRoute[2]) {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title);
        return send(res, 201, JSON.stringify(listTasks.all(projectId).find(task => task.id === Number(result.lastInsertRowid))));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (req.method === 'PATCH' && taskRoute[2]) {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const bodyData = JSON.parse(body);
        if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        const taskId = Number(taskRoute[2]);
        if (Object.hasOwn(bodyData, 'priority')) {
          const priority = bodyData.priority;
          if (!['Low', 'Normal', 'High'].includes(priority)) return send(res, 400, JSON.stringify({ error: 'Invalid task priority' }));
          const result = updateTaskPriority.run(priority, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        if (Object.hasOwn(bodyData, 'title')) {
          const title = String(bodyData.title ?? '').trim();
          if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
          const result = renameTask.run(title, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        const completed = bodyData.completed;
        if (typeof completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
        const result = updateTask.run(completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    const project = getProject.get(Number(url.pathname.split('/')[2]));
    if (!project) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
