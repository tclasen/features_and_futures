import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(resolve(process.env.DB_PATH || './workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep databases created by earlier task checkpoints usable.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const indexHtml = await readFile(new URL('./public/index.html', import.meta.url));
const styles = await readFile(new URL('./public/styles.css', import.meta.url));
const appJs = await readFile(new URL('./public/app.js', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`).all(archived);
    return send(res, 200, JSON.stringify(projects.map(project => ({
      ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount)
    }))));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name, archived: false }));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (req.method === 'PATCH' && archiveMatch) {
    const data = await readJson(req);
    if (typeof data?.archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Archive state is required' }));
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(data.archived ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? send(res, 200, JSON.stringify({ id: Number(archiveMatch[1]), archived: data.archived })) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const detailMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && detailMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(detailMatch[1]));
    return project ? send(res, 200, JSON.stringify({ ...project, archived: Boolean(project.archived) })) : send(res, 404, JSON.stringify({ error: 'Project not found' }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET') {
      const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      return send(res, 200, JSON.stringify(tasks.map(task => ({ ...task, completed: Boolean(task.completed) }))));
    }
    if (req.method === 'POST') {
      const fullProject = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
      if (fullProject.archived) return send(res, 403, JSON.stringify({ error: 'Archived projects cannot receive tasks' }));
      const data = await readJson(req);
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const data = await readJson(req);
    if (typeof data?.completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Completion state is required' }));
    const owner = db.prepare('SELECT p.archived FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?').get(Number(taskMatch[1]));
    if (owner?.archived) return send(res, 403, JSON.stringify({ error: 'Archived project tasks cannot be changed' }));
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    return result.changes ? send(res, 200, JSON.stringify({ id: Number(taskMatch[1]), completed: data.completed })) : send(res, 404, JSON.stringify({ error: 'Task not found' }));
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') return send(res, 200, styles, 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, appJs, 'text/javascript; charset=utf-8');
  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
