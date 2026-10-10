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
);
CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
)`);
// Preserve the established task ordering when introducing per-project positions.
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id) - 1 FROM tasks`);
for (const migration of [
  'ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))',
  "ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"
]) {
  try { db.exec(migration); } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error;
  }
}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const html = await readFile(path.join(root, 'public', 'index.html'));

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

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
    return sendJson(response, 200, db.prepare('SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate FROM tasks t JOIN task_project_positions pos ON pos.task_id = t.id AND pos.project_id = t.project_id WHERE t.project_id = ? ORDER BY pos.position').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
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
        const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
        if (!project) return sendJson(response, 404, { error: 'Project not found' });
        if (project.archived) return sendJson(response, 409, { error: 'Project is archived' });
        const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, project.default_priority);
        const taskId = Number(result.lastInsertRowid);
        const position = Number(db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM task_project_positions WHERE project_id = ?').get(projectId).position);
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, projectId, position);
        return sendJson(response, 201, { id: taskId, projectId, title, completed: false, priority: project.default_priority });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  const moveRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const destinationId = Number(JSON.parse(body).projectId);
        if (!Number.isSafeInteger(destinationId) || destinationId < 1) return sendJson(response, 400, { error: 'Invalid destination project' });
        const taskId = Number(moveRoute[1]);
        const task = db.prepare(`SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.archived = 0`).get(taskId);
        const destination = db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(destinationId);
        if (!task || !destination || task.project_id === destinationId) return sendJson(response, 404, { error: 'Active task or destination not found' });
        db.exec('BEGIN');
        try {
          const priorPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId);
          let position;
          if (priorPosition) {
            position = priorPosition.position;
          } else {
            position = Number(db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM task_project_positions WHERE project_id = ?').get(destinationId).position);
            db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(taskId, destinationId, position);
          }
          if (priorPosition) {
            const occupyingTask = db.prepare('SELECT task_id FROM task_project_positions WHERE project_id = ? AND position = ?').get(destinationId, position);
            if (occupyingTask) {
              // Reopenings can meet newly established slots; shift the suffix while preserving its order.
              const offset = 1_000_000_000;
              db.prepare('UPDATE task_project_positions SET position = position + ? WHERE project_id = ? AND position >= ?').run(offset, destinationId, position);
              db.prepare('UPDATE task_project_positions SET position = position - ? + 1 WHERE project_id = ? AND position >= ?').run(offset, destinationId, position + offset);
            }
          }
          db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?').run(destinationId, taskId);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(response, 200, { ok: true });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
  }
  const dueDateRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/due-date$/);
  if (dueDateRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const raw = JSON.parse(body).dueDate;
        const dueDate = String(raw ?? '').trim();
        if (dueDate && !validDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const result = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)').run(dueDate || null, Number(dueDateRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Active task not found' });
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
  const priorityRoute = url.pathname.match(/^\/api\/tasks\/(\d+)\/priority$/);
  if (priorityRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const priority = JSON.parse(body).priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid task priority' });
        const result = db.prepare("UPDATE tasks SET priority = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)").run(priority, Number(priorityRoute[1]));
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
    return sendJson(response, 200, db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
      FROM projects p ORDER BY p.id`).all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  }
  const defaultPriorityRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultPriorityRoute && request.method === 'PATCH') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const priority = JSON.parse(body).priority;
        if (!['Low', 'Normal', 'High'].includes(priority)) return sendJson(response, 400, { error: 'Invalid default task priority' });
        const result = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0').run(priority, Number(defaultPriorityRoute[1]));
        return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Active project not found' });
      } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    });
    return;
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
