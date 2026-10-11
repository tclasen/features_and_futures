import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare('SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateArchive = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(root, 'index.html'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') return send(200, JSON.stringify(listProjects.all()));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    const id = Number(archiveMatch[1]);
    if (!getProject.get(id)) return send(404, JSON.stringify({ error: 'Not found' }));
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived;
      if (typeof archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid request' }));
      updateArchive.run(archived ? 1 : 0, id);
      return send(200, JSON.stringify(getProject.get(id)));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (taskMatch) {
    const projectId = Number(taskMatch[1]);
    if (!getProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (!taskMatch[2] && req.method === 'GET') return send(200, JSON.stringify(listTasks.all(projectId)));
    if (!taskMatch[2] && req.method === 'POST') {
      if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title);
        return send(201, JSON.stringify(getTask.get(result.lastInsertRowid, projectId)));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (taskMatch[2] && req.method === 'PATCH') {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const bodyValue = JSON.parse(body);
        const id = Number(taskMatch[2]);
        if (!getTask.get(id, projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
        if (getProject.get(projectId).archived) return send(403, JSON.stringify({ error: 'Archived project' }));
        if (typeof bodyValue.completed === 'boolean') {
          updateTask.run(bodyValue.completed ? 1 : 0, id, projectId);
        } else if (typeof bodyValue.title === 'string') {
          const title = bodyValue.title.trim();
          if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
          renameTask.run(title, id, projectId);
        } else return send(400, JSON.stringify({ error: 'Invalid request' }));
        return send(200, JSON.stringify(getTask.get(id, projectId)));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (projectMatch && req.method === 'PATCH') {
    const id = Number(projectMatch[1]);
    const project = getProject.get(id);
    if (!project) return send(404, JSON.stringify({ error: 'Not found' }));
    if (project.archived) return send(403, JSON.stringify({ error: 'Archived project' }));
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      renameProject.run(name, id);
      return send(200, JSON.stringify(getProject.get(id)));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, JSON.stringify(getProject.get(result.lastInsertRowid)));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
