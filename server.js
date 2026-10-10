import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
// Upgrade databases created by earlier checkpoints.
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
const listTasks = db.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed, priority FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`);
const page = await readFile(new URL('./index.html', import.meta.url));

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(listProjects.all()));
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (renameRoute && req.method === 'PATCH') {
    const id = Number(renameRoute[1]);
    const project = Number.isSafeInteger(id) && id > 0 ? getProject.get(id) : null;
    if (!project) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(res, 400, JSON.stringify({ error: 'Archived projects cannot be changed' }));
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.defaultPriority === 'string' && ['Low', 'Normal', 'High'].includes(data.defaultPriority)) {
        updateProjectDefault.run(data.defaultPriority, id);
      } else {
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
        renameProject.run(name, id);
      }
      return send(res, 200, JSON.stringify(getProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveRoute && req.method === 'POST') {
    const id = Number(archiveRoute[1]);
    if (!getProject.get(id)) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    setArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, id);
    return send(res, 200, JSON.stringify(getProject.get(id)));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    const project = Number.isSafeInteger(projectId) && projectId > 0 ? getProject.get(projectId) : null;
    if (!project) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    if (req.method === 'GET') return send(res, 200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST') {
      if (project.archived) return send(res, 400, JSON.stringify({ error: 'Archived projects cannot be changed' }));
      let body = '';
      try {
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title, project.defaultPriority);
        return send(res, 201, JSON.stringify(getTask.get(Number(result.lastInsertRowid), projectId)));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const taskUpdate = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    const projectId = Number(taskUpdate[1]), taskId = Number(taskUpdate[2]);
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const project = getProject.get(projectId);
      if (!project) return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
      if (project.archived) return send(res, 400, JSON.stringify({ error: 'Archived projects cannot be changed' }));
      if (typeof data.title === 'string') {
        const title = data.title.trim();
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = renameTask.run(title, taskId, projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Not found' }));
      } else if (typeof data.completed === 'boolean') {
        const result = updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Not found' }));
      } else if (typeof data.priority === 'string' && ['Low', 'Normal', 'High'].includes(data.priority)) {
        const result = updatePriority.run(data.priority, taskId, projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Not found' }));
      } else return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
      return send(res, 200, JSON.stringify(getTask.get(taskId, projectId)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = Number(url.pathname.slice('/api/projects/'.length));
    const project = Number.isSafeInteger(id) && id > 0 ? getProject.get(id) : null;
    return project ? send(res, 200, JSON.stringify(project)) : send(res, 404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
