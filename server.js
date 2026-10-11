import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  due_date TEXT
)`);

try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}

try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column')) throw error;
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let text = '';
  for await (const chunk of request) text += chunk;
  try { return JSON.parse(text); } catch { return null; }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    return sendJson(response, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`).all(archived).map(project => ({
        ...project, archived: Boolean(project.archived), totalCount: Number(project.totalCount), completedCount: Number(project.completedCount)
      })));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, Number(renameMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true, name }) : sendJson(response, 404, { error: 'Project not found or archived' });
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(body.priority, Number(defaultPriorityMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found or archived' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state must be a boolean' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') {
      return sendJson(response, 200, db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    }
    if (request.method === 'POST') {
      if (project.archived) return sendJson(response, 409, { error: 'Archived project cannot accept tasks' });
      const body = await readBody(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, (SELECT default_priority FROM projects WHERE id = ?))').run(projectId, title, projectId);
      const priority = db.prepare('SELECT priority FROM tasks WHERE id = ?').get(Number(result.lastInsertRowid)).priority;
      return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority });
    }
  }
  const dueDateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
  if (dueDateMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    let dueDate = typeof body?.dueDate === 'string' ? body.dueDate.trim() : '';
    if (dueDate) {
      const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      const [, year, month, day] = match;
      const y = Number(year), m = Number(month), d = Number(day);
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
    } else dueDate = null;
    const task = db.prepare('SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.archived = 0').get(Number(dueDateMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found or project archived' });
    db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(dueDate, task.id);
    return sendJson(response, 200, { ok: true, dueDate });
  }
  const taskRenameMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/rename$/);
  if (taskRenameMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = db.prepare(`UPDATE tasks SET title = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(title, Number(taskRenameMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true, title }) : sendJson(response, 404, { error: 'Task not found or project archived' });
  }
  const taskPriorityMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/priority$/);
  if (taskPriorityMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (!['Low', 'Normal', 'High'].includes(body?.priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
    const result = db.prepare(`UPDATE tasks SET priority = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(body.priority, Number(taskPriorityMatch[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Task not found or project archived' });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be a boolean' });
    const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(body.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, { ok: true });
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(await (await import('node:fs/promises')).readFile(join(root, 'public', 'index.html')));
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
