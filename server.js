import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(base, 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal')`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch {}
const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const findProject = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY created_at, rowid');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const html = await readFile(path.join(base, 'public', 'index.html'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const project = findProject.get(decodeURIComponent(archiveMatch[1]));
    if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
    setArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, project.id);
    return send(200, JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      if (name.length > 500) return send(400, JSON.stringify({ error: 'Project name is too long' }));
      const id = randomUUID();
      insertProject.run(id, name, Date.now());
      return send(201, JSON.stringify({ id, name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (taskMatch) {
    const projectId = decodeURIComponent(taskMatch[1]);
    if (!findProject.get(projectId)) return send(404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET' && !taskMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !taskMatch[2]) {
      if (findProject.get(projectId).archived) return send(409, JSON.stringify({ error: 'Archived project' }));
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const title = String(JSON.parse(raw).title ?? '').trim();
        if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
        if (title.length > 500) return send(400, JSON.stringify({ error: 'Task title is too long' }));
        const id = randomUUID(); const priority = findProject.get(projectId).default_priority; insertTask.run(id, projectId, title, Date.now(), priority);
        return send(201, JSON.stringify({ id, title, completed: 0, priority }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (req.method === 'PATCH' && taskMatch[2]) {
      if (findProject.get(projectId).archived) return send(409, JSON.stringify({ error: 'Archived project' }));
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const taskId = decodeURIComponent(taskMatch[2]);
        if (Object.hasOwn(body, 'due_date')) {
          const rawDate = String(body.due_date ?? '').trim();
          let dueDate = null;
          if (rawDate) {
            const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!dateMatch) return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
            const year = Number(dateMatch[1]), month = Number(dateMatch[2]), day = Number(dateMatch[3]);
            const parsed = new Date(0);
            parsed.setUTCHours(0, 0, 0, 0);
            parsed.setUTCFullYear(year, month - 1, day);
            if (year < 1 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
            dueDate = rawDate;
          }
          const result = updateDueDate.run(dueDate, taskId, projectId);
          return Number(result.changes) ? send(200, JSON.stringify({ ok: true, due_date: dueDate })) : send(404, JSON.stringify({ error: 'Task not found' }));
        }
        if (Object.hasOwn(body, 'priority')) {
          if (!['Low', 'Normal', 'High'].includes(body.priority)) return send(400, JSON.stringify({ error: 'Invalid task priority' }));
          const result = updatePriority.run(body.priority, taskId, projectId);
          return Number(result.changes) ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
        }
        if (Object.hasOwn(body, 'title')) {
          const title = String(body.title ?? '').trim();
          if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
          if (title.length > 500) return send(400, JSON.stringify({ error: 'Task title is too long' }));
          const result = renameTask.run(title, taskId, projectId);
          return Number(result.changes) ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
        }
        const completed = body.completed ? 1 : 0;
        const result = updateTask.run(completed, taskId, projectId);
        return Number(result.changes) ? send(200, JSON.stringify({ ok: true })) : send(404, JSON.stringify({ error: 'Task not found' }));
      } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'PATCH' && match) {
    const project = findProject.get(decodeURIComponent(match[1]));
    if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
    if (project.archived) return send(409, JSON.stringify({ error: 'Archived project' }));
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (Object.hasOwn(body, 'default_priority')) {
        if (!['Low', 'Normal', 'High'].includes(body.default_priority)) return send(400, JSON.stringify({ error: 'Invalid task priority' }));
        updateDefaultPriority.run(body.default_priority, project.id);
        return send(200, JSON.stringify({ ok: true }));
      }
      const name = String(body.name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      if (name.length > 500) return send(400, JSON.stringify({ error: 'Project name is too long' }));
      renameProject.run(name, project.id);
      return send(200, JSON.stringify({ id: project.id, name }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'GET' && match) {
    const item = findProject.get(decodeURIComponent(match[1]));
    return item ? send(200, JSON.stringify(item)) : send(404, JSON.stringify({ error: 'Project not found' }));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'Not found' }));
  return send(404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
