import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(here, 'workboard.sqlite');
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');

// Older runs could create the same project repeatedly. Keep the first project
// ID and move any tasks from duplicates onto it before removing duplicate rows.
const duplicateProjects = db.prepare(`SELECT name, MIN(id) AS keepId
  FROM projects GROUP BY name HAVING COUNT(*) > 1`).all();
const mergeDuplicates = () => {
  const duplicatesForName = db.prepare('SELECT id FROM projects WHERE name = ? AND id != ?');
  const moveTasks = db.prepare('UPDATE tasks SET project_id = ? WHERE project_id = ?');
  const removeProject = db.prepare('DELETE FROM projects WHERE id = ?');
  const markArchived = db.prepare('UPDATE projects SET archived = 1 WHERE id = ?');
  for (const duplicate of duplicateProjects) {
    for (const row of duplicatesForName.all(duplicate.name, duplicate.keepId)) {
      moveTasks.run(duplicate.keepId, row.id);
      if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(row.id).archived) {
        markArchived.run(duplicate.keepId);
      }
      removeProject.run(row.id);
    }
  }
};
db.exec('BEGIN');
try {
  mergeDuplicates();
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS projects_name_unique ON projects(name)');

const indexHtml = await readFile(path.join(here, 'index.html'));
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id`).all().map(project => ({
        ...project, archived: Boolean(project.archived),
        totalCount: Number(project.totalCount), completedCount: Number(project.completedCount)
      })));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return json(res, 400, { error: 'Project name is required' });
    // Treat a retried create request as idempotent so it cannot add a duplicate.
    const existing = db.prepare('SELECT id, name FROM projects WHERE name = ?').get(name);
    if (existing) return json(res, 200, { id: Number(existing.id), name: existing.name });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const projectId = Number(tasksMatch[1]);
    const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (project.archived) return json(res, 409, { error: 'Archived project' });
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return json(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (typeof input.completed !== 'boolean') return json(res, 400, { error: 'Completion state is required' });
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(taskMatch[1]));
    if (!task) return json(res, 404, { error: 'Task not found' });
    if (db.prepare('SELECT archived FROM projects WHERE id = ?').get(task.project_id).archived) return json(res, 409, { error: 'Archived project' });
    db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(input.completed ? 1 : 0, Number(taskMatch[1]));
    return json(res, 200, { ok: true });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (typeof input.archived !== 'boolean') return json(res, 400, { error: 'Archive state is required' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(input.archived ? 1 : 0, Number(projectMatch[1]));
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
