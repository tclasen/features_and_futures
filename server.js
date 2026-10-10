import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(root, 'data', 'workboard.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/?$/);
  const completionRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
  async function readBody() {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 100_000) throw Object.assign(new Error('Request body too large'), { status: 413 });
    }
    try { return JSON.parse(body); }
    catch { throw Object.assign(new Error('Invalid request body'), { status: 400 }); }
  }
  if (taskRoute && req.method === 'GET') {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC').all(projectId)
      .map((task) => ({ ...task, id: Number(task.id), projectId: Number(task.projectId), completed: Boolean(task.completed) }));
    return json(res, 200, tasks);
  }
  if (taskRoute && req.method === 'POST') {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const title = String(body.title ?? '').trim();
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
  }
  if (completionRoute && req.method === 'PATCH') {
    const projectId = Number(completionRoute[1]);
    const taskId = Number(completionRoute[2]);
    let body;
    try { body = await readBody(); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (typeof body.completed !== 'boolean') return json(res, 400, { error: 'Completion state is required' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?').run(body.completed ? 1 : 0, taskId, projectId);
    if (!result.changes) return json(res, 404, { error: 'Task not found' });
    return json(res, 200, { id: taskId, projectId, completed: body.completed });
  }
  if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all());
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let name;
    try { name = String((await readBody()).name ?? '').trim(); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
    if (!name) return json(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    const html = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    else res.destroy();
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
