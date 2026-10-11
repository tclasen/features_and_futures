import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High')));
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High')), due_date TEXT)  `);
if (!db.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
if (!db.prepare("PRAGMA table_info(tasks)").all().some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
db.exec('PRAGMA foreign_keys = ON');
const listProjects = db.prepare('SELECT p.id, p.name, p.archived, p.default_priority, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.created_at, p.rowid');
const createProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const getProject = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const createTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(listProjects.all())); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project name is required' })); return; }
      const project = { id: randomUUID(), name };
      createProject.run(project.id, name, Date.now());
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(project));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid request' })); }
    return;
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (renameRoute && req.method === 'PATCH') {
    const projectId = decodeURIComponent(renameRoute[1]);
    const project = getProject.get(projectId);
    if (!project) { res.writeHead(404); res.end('Not found'); return; }
    if (project.archived) { res.writeHead(403); res.end('Archived project'); return; }
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project name is required' })); return; }
      renameProject.run(name, projectId);
      res.writeHead(204); res.end();
    } catch { res.writeHead(400); res.end('Invalid request'); }
    return;
  }
  const defaultPriorityRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-priority$/);
  if (defaultPriorityRoute && req.method === 'PATCH') {
    const projectId = decodeURIComponent(defaultPriorityRoute[1]);
    const project = getProject.get(projectId);
    if (!project) { res.writeHead(404); res.end('Not found'); return; }
    if (project.archived) { res.writeHead(403); res.end('Archived project'); return; }
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const priority = JSON.parse(body).priority;
      if (!['Low', 'Normal', 'High'].includes(priority)) { res.writeHead(400); res.end('Invalid priority'); return; }
      updateProjectDefault.run(priority, projectId);
      res.writeHead(204); res.end();
    } catch { res.writeHead(400); res.end('Invalid request'); }
    return;
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (archiveRoute && req.method === 'POST') {
    const projectId = decodeURIComponent(archiveRoute[1]);
    if (!getProject.get(projectId)) { res.writeHead(404); res.end('Not found'); return; }
    setArchived.run(archiveRoute[2] === 'archive' ? 1 : 0, projectId);
    res.writeHead(204); res.end(); return;
  }
  const moveRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/move$/);
  if (moveRoute && req.method === 'POST') {
    const sourceId = decodeURIComponent(moveRoute[1]);
    const taskId = decodeURIComponent(moveRoute[2]);
    const source = getProject.get(sourceId);
    if (!source) { res.writeHead(404); res.end('Not found'); return; }
    if (source.archived) { res.writeHead(403); res.end('Archived project'); return; }
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const destinationId = String(JSON.parse(body).destination_id ?? '');
      const destination = getProject.get(destinationId);
      if (!destination || destination.archived || destinationId === sourceId) { res.writeHead(400); res.end('Invalid destination'); return; }
      const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
      if (!task) { res.writeHead(404); res.end('Not found'); return; }
      const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(created_at), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(destinationId).value);
      db.prepare('UPDATE tasks SET project_id = ?, created_at = ? WHERE id = ? AND project_id = ?').run(destinationId, nextOrder, taskId, sourceId);
      res.writeHead(204); res.end();
    } catch { res.writeHead(400); res.end('Invalid request'); }
    return;
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (taskRoute) {
    const projectId = decodeURIComponent(taskRoute[1]);
    if (!getProject.get(projectId)) { res.writeHead(404); res.end('Not found'); return; }
    if (!taskRoute[2] && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(listTasks.all(projectId))); return; }
    if (!taskRoute[2] && req.method === 'POST') {
      if (getProject.get(projectId).archived) { res.writeHead(403); res.end('Archived project'); return; }
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task title is required' })); return; }
        const priority = getProject.get(projectId).default_priority;
        const task = { id: randomUUID(), title, completed: 0, priority };
        db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)').run(task.id, projectId, title, Date.now(), priority);
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(task)); return;
      } catch { res.writeHead(400); res.end('Invalid request'); return; }
    }
    if (taskRoute[2] && req.method === 'PATCH') {
      if (getProject.get(projectId).archived) { res.writeHead(403); res.end('Archived project'); return; }
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const id = decodeURIComponent(taskRoute[2]);
        if (Object.hasOwn(data, 'due_date')) {
          const date = String(data.due_date ?? '').trim();
          if (date && !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' })); return; }
          if (date) { const [year, month, day] = date.split('-').map(Number); const parsed = new Date(Date.UTC(year, month - 1, day)); parsed.setUTCFullYear(year); if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' })); return; } }
          updateDueDate.run(date || null, id, projectId);
          if (!db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(id, projectId)) { res.writeHead(404); res.end('Not found'); return; }
        } else if (Object.hasOwn(data, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(data.priority)) { res.writeHead(400); res.end('Invalid priority'); return; }
          const result = updatePriority.run(data.priority, id, projectId);
          if (!result.changes) { res.writeHead(404); res.end('Not found'); return; }
        } else if (Object.hasOwn(data, 'title')) {
          const title = String(data.title ?? '').trim();
          if (!title) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task title is required' })); return; }
          const result = renameTask.run(title, id, projectId);
          if (!result.changes) { res.writeHead(404); res.end('Not found'); return; }
        } else {
          const result = updateTask.run(data.completed ? 1 : 0, id, projectId);
          if (!result.changes) { res.writeHead(404); res.end('Not found'); return; }
        }
        res.writeHead(204); res.end(); return;
      } catch { res.writeHead(400); res.end('Invalid request'); return; }
    }
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const html = await readFile(path.join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch { res.writeHead(500); res.end('Application unavailable'); }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
