import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return send(response, 200, JSON.stringify(listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) }))));
  }
  const projectRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectRoute && request.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      const id = Number(projectRoute[1]);
      const project = findProject.get(id);
      if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
      if (typeof payload.archived === 'boolean') {
        updateProjectArchived.run(payload.archived ? 1 : 0, id);
        return send(response, 200, JSON.stringify({ ...findProject.get(id), archived: payload.archived }));
      }
      if (typeof payload.name === 'string') {
        const name = payload.name.trim();
        if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
        if (project.archived) return send(response, 409, JSON.stringify({ error: 'Archived projects cannot be renamed' }));
        updateProjectName.run(name, id);
        return send(response, 200, JSON.stringify(findProject.get(id)));
      }
      return send(response, 400, JSON.stringify({ error: 'Invalid project update' }));
    } catch { return send(response, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let raw = '';
    try {
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 16_384) return send(response, 413, JSON.stringify({ error: 'Request too large' }));
      }
      const payload = JSON.parse(raw);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = insertProject.run(name);
      return send(response, 201, JSON.stringify(findProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!findProject.get(projectId)) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (request.method === 'GET' && !taskRoute[2]) {
      return send(response, 200, JSON.stringify(listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) }))));
    }
    if (request.method === 'POST' && !taskRoute[2]) {
      try {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 16_384) return send(response, 413, JSON.stringify({ error: 'Request too large' }));
        }
        const payload = JSON.parse(raw);
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) return send(response, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = insertTask.run(projectId, title);
        return send(response, 201, JSON.stringify({ ...findTask.get(Number(result.lastInsertRowid), projectId), completed: false }));
      } catch {
        return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
      }
    }
    if (request.method === 'PATCH' && taskRoute[2]) {
      try {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const payload = JSON.parse(raw);
        if (typeof payload.completed !== 'boolean') return send(response, 400, JSON.stringify({ error: 'Invalid completion state' }));
        const result = updateTask.run(payload.completed ? 1 : 0, Number(taskRoute[2]), projectId);
        if (!result.changes) return send(response, 404, JSON.stringify({ error: 'Task not found' }));
        return send(response, 200, JSON.stringify({ ...findTask.get(Number(taskRoute[2]), projectId), completed: payload.completed }));
      } catch {
        return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
      }
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      return send(response, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(response, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
