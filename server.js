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
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const html = await readFile(path.join(root, 'public', 'index.html'));

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && request.method === 'GET') {
    const projectId = Number(taskRoute[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (taskRoute && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const projectId = Number(taskRoute[1]);
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
        if (!project) return sendJson(response, 404, { error: 'Project not found' });
        if (project.archived) return sendJson(response, 409, { error: 'Project is archived' });
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  const taskRenameRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (taskRenameRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const title = String(JSON.parse(body).title ?? '').trim();
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const result = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(title, Number(taskRenameRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Active task not found' });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  const completionRoute = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (completionRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const completed = JSON.parse(body).completed;
        if (typeof completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
        const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(completed ? 1 : 0, Number(completionRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found' });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id`).all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const name = String(JSON.parse(body).name ?? '').trim();
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Active project not found' });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const archived = JSON.parse(body).archived;
        if (typeof archived !== 'boolean') return sendJson(response, 400, { error: 'Invalid archive state' });
        const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, Number(archiveRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const name = String(JSON.parse(body).name ?? '').trim();
        if (!name) return sendJson(response, 400, { error: 'Project name is required' });
        const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
      } catch {
        return sendJson(response, 400, { error: 'Invalid request' });
      }
    });
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(html);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
