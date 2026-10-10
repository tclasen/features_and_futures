import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'workboard.sqlite');
await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
const html = await readFile(new URL('./index.html', import.meta.url));
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
async function bodyJson(req) { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try { const body = await bodyJson(req); const name = typeof body.name === 'string' ? body.name.trim() : ''; if (!name) return sendJson(res, 400, { error: 'Project name is required' }); const project = { id: randomUUID(), name }; db.prepare('INSERT INTO projects (id,name,created_at) VALUES (?,?,?)').run(project.id, name, Date.now()); return sendJson(res, 201, project); }
    catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    const projectId = decodeURIComponent(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId)) return sendJson(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id=? ORDER BY created_at,rowid').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (req.method === 'POST') {
      try { const body = await bodyJson(req); const title = typeof body.title === 'string' ? body.title.trim() : ''; if (!title) return sendJson(res, 400, { error: 'Task title is required' }); const task = { id: randomUUID(), projectId, title, completed: false }; db.prepare('INSERT INTO tasks (id,project_id,title,created_at) VALUES (?,?,?,?)').run(task.id, projectId, title, Date.now()); return sendJson(res, 201, task); }
      catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try { const body = await bodyJson(req); const result = db.prepare('UPDATE tasks SET completed=? WHERE id=?').run(body.completed ? 1 : 0, decodeURIComponent(taskMatch[1])); if (!result.changes) return sendJson(res, 404, { error: 'Task not found' }); return sendJson(res, 200, { ok: true }); }
    catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+$/.test(url.pathname))) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
