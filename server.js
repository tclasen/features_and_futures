import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(path.resolve(dbPath));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const json = (res, status, value) => send(res, status, JSON.stringify(value));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return json(res, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
      const id = Number(archiveMatch[1]);
      if (!getProject.get(id)) return json(res, 404, { error: 'Project not found' });
      setArchived.run(data.archived ? 1 : 0, id);
      return json(res, 200, { ...getProject.get(id), archived: data.archived });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = addProject.run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const projectId = Number(tasksMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot accept tasks' });
      const result = addTask.run(projectId, title);
      return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const task = getTask.get(taskId, projectId);
      if (!task) return json(res, 404, { error: 'Task not found' });
      if (getProject.get(projectId).archived) return json(res, 409, { error: 'Archived project tasks cannot be changed' });
      if (Object.hasOwn(data, 'title')) {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        renameTask.run(title, taskId, projectId);
      } else if (typeof data.completed === 'boolean') {
        updateTask.run(data.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(data.priority)) {
        updateTaskPriority.run(data.priority, taskId, projectId);
      } else return json(res, 400, { error: 'Invalid task update' });
      const updatedTask = getTask.get(taskId, projectId);
      return json(res, 200, { ...updatedTask, completed: Boolean(updatedTask.completed) });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const id = Number(renameMatch[1]);
      const project = getProject.get(id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot be renamed' });
      renameProject.run(name, id);
      return json(res, 200, getProject.get(id));
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? json(res, 200, { ...project, archived: Boolean(project.archived) }) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      return send(res, 200, await readFile(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Application unavailable' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
