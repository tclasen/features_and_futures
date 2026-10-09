import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || path.join(directory, 'workboard.sqlite');
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
database.exec('PRAGMA foreign_keys = ON');

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
};

const app = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return send(response, 200, JSON.stringify(database.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let name;
    try { name = String((await readJson(request)).name ?? '').trim(); } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && ['GET', 'POST'].includes(request.method)) {
    const projectId = Number(tasksMatch[1]);
    const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return send(response, 404, JSON.stringify({ error: 'Project not found' }));
    if (request.method === 'GET') {
      const tasks = database.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId);
      return send(response, 200, JSON.stringify(tasks.map((task) => ({ ...task, completed: Boolean(task.completed) }))));
    }
    let title;
    try { title = String((await readJson(request)).title ?? '').trim(); } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    if (!title) return send(response, 400, JSON.stringify({ error: 'Task title is required' }));
    const result = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), projectId, title, completed: false }));
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    let completed;
    try { completed = Boolean((await readJson(request)).completed); } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    const result = database.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return send(response, 404, JSON.stringify({ error: 'Task not found' }));
    return send(response, 200, JSON.stringify({ id: Number(taskMatch[1]), completed }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try { return send(response, 200, await readFile(path.join(directory, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8'); }
    catch { return send(response, 500, 'Application page unavailable', 'text/plain; charset=utf-8'); }
  }
  return send(response, 404, JSON.stringify({ error: 'Not found' }));
});

app.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));
