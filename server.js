import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'data/workboard.sqlite'));
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, rowid)
  FROM tasks`);
function transaction(callback) {
  db.exec('BEGIN');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const insertProject = db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)');
const insertTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority) VALUES (?, ?, ?, 0, ?, ?)');
const listTasks = db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
  FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position`);
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
const setTaskCompletion = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?');
const moveTask = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  COUNT(CASE WHEN t.deleted = 0 THEN t.id END) AS totalCount, COALESCE(SUM(CASE WHEN t.deleted = 0 THEN t.completed ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.created_at, p.rowid`);
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const indexHtml = await readFile(resolve(root, 'public/index.html'));
const appJs = await readFile(resolve(root, 'public/app.js'));
const appCss = await readFile(resolve(root, 'public/style.css'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
    if (req.method === 'GET' && url.pathname === '/api/directory') {
      const rows = db.prepare(`SELECT p.id AS projectId, p.name AS projectName, p.archived,
        t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
        FROM projects p JOIN task_project_positions pos ON pos.project_id = p.id
        JOIN tasks t ON t.id = pos.task_id AND t.project_id = p.id
        ORDER BY p.created_at, p.rowid, pos.position`).all();
      return send(200, JSON.stringify(rows));
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const archived = url.searchParams.get('archived') === 'true' ? 1 : 0;
      return send(200, JSON.stringify(listProjects.all(archived)));
    }
    const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
    if (req.method === 'PATCH' && archiveMatch) {
      const project = getProject.get(archiveMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof payload?.archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid archive state' }));
      setArchived.run(payload.archived ? 1 : 0, project.id);
      return send(200, JSON.stringify({ ...project, archived: payload.archived ? 1 : 0 }));
    }
    if (req.method === 'POST' && url.pathname === '/api/projects/import') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid project JSON' })); }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      let sourceDocument;
      try { sourceDocument = typeof payload.document === 'string' ? JSON.parse(payload.document) : payload.document; } catch { return send(400, JSON.stringify({ error: 'Invalid project JSON' })); }
      const document = validateProjectDocument(sourceDocument);
      if (!document) return send(400, JSON.stringify({ error: 'Invalid project JSON' }));
      const id = randomUUID();
      transaction(() => {
        db.prepare('INSERT INTO projects (id, name, created_at, archived, default_priority) VALUES (?, ?, ?, ?, ?)')
          .run(id, name, Date.now(), document.project.archived ? 1 : 0, document.project.defaultPriority);
        const addTask = db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at, priority, due_date, notes, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const addPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
        document.project.tasks.forEach((task, index) => {
          const taskId = randomUUID();
          addTask.run(taskId, id, task.title, task.completed ? 1 : 0, Date.now() + index, task.priority, task.dueDate || null, task.notes, task.deleted ? 1 : 0);
          addPosition.run(taskId, id, index + 1);
        });
      });
      return send(201, JSON.stringify({ id, name }));
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const id = randomUUID();
      insertProject.run(id, name, Date.now());
      return send(201, JSON.stringify({ id, name }));
    }
    const renameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'PATCH' && renameMatch) {
      const project = getProject.get(renameMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (project.archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (['Low', 'Normal', 'High'].includes(payload?.defaultPriority)) {
        db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(payload.defaultPriority, project.id);
        return send(200, JSON.stringify({ ...project, defaultPriority: payload.defaultPriority }));
      }
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      renameProject.run(name, project.id);
      return send(200, JSON.stringify({ ...project, name }));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
    if (tasksMatch && (req.method === 'GET' || req.method === 'POST')) {
      const project = getProject.get(tasksMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      if (req.method === 'GET') return send(200, JSON.stringify(listTasks.all(tasksMatch[1])));
      if (project.archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      const task = { id: randomUUID(), projectId: tasksMatch[1], title, completed: 0 };
      task.priority = project.defaultPriority;
      const create = () => transaction(() => {
        insertTask.run(task.id, task.projectId, task.title, Date.now(), task.priority);
        const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(task.projectId).value;
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(task.id, task.projectId, position);
      });
      create();
      return send(201, JSON.stringify(task));
    }
    const moveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/move$/);
    if (req.method === 'POST' && moveMatch) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const task = getTask.get(moveMatch[1]);
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      const source = getProject.get(task.projectId);
      const destination = getProject.get(payload?.destinationProjectId);
      if (task.deleted || source.archived || !destination || destination.archived || destination.id === source.id) return send(400, JSON.stringify({ error: 'Invalid destination project' }));
      const move = () => transaction(() => {
        const knownPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(task.id, destination.id);
        let position = knownPosition?.position;
        if (position === undefined) {
          position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destination.id).value;
          db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)').run(task.id, destination.id, position);
        }
        moveTask.run(destination.id, task.id);
      });
      move();
      return send(200, JSON.stringify({ ...task, projectId: destination.id }));
    }
    const deletionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/deletion$/);
    if (req.method === 'PATCH' && deletionMatch) {
      const task = getTask.get(deletionMatch[1]);
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      if (getProject.get(task.projectId).archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      if (typeof payload?.deleted !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid deletion state' }));
      db.prepare('UPDATE tasks SET deleted = ? WHERE id = ?').run(payload.deleted ? 1 : 0, task.id);
      return send(200, JSON.stringify({ ...task, deleted: payload.deleted ? 1 : 0 }));
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (req.method === 'PATCH' && taskMatch) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: 'Invalid JSON' })); }
      const task = getTask.get(taskMatch[1]);
      if (!task) return send(404, JSON.stringify({ error: 'Task not found' }));
      if (getProject.get(task.projectId).archived) return send(409, JSON.stringify({ error: 'Archived project cannot be changed' }));
      if (typeof payload?.completed === 'boolean') {
        setTaskCompletion.run(payload.completed ? 1 : 0, task.id);
        return send(200, JSON.stringify({ ...task, completed: payload.completed ? 1 : 0 }));
      }
      if (Object.hasOwn(payload ?? {}, 'notes')) {
        if (typeof payload.notes !== 'string') return send(400, JSON.stringify({ error: 'Notes must be text' }));
        db.prepare('UPDATE tasks SET notes = ? WHERE id = ?').run(payload.notes, task.id);
        return send(200, JSON.stringify({ ...task, notes: payload.notes }));
      }
      if (Object.hasOwn(payload ?? {}, 'dueDate')) {
        if (typeof payload.dueDate !== 'string') return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        const dueDate = payload.dueDate.trim();
        if (dueDate && !isValidDueDate(dueDate)) return send(400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        setTaskDueDate.run(dueDate || null, task.id);
        return send(200, JSON.stringify({ ...task, dueDate: dueDate || null }));
      }
      if (['Low', 'Normal', 'High'].includes(payload?.priority)) {
        setTaskPriority.run(payload.priority, task.id);
        return send(200, JSON.stringify({ ...task, priority: payload.priority }));
      }
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      renameTask.run(title, task.id);
      return send(200, JSON.stringify({ ...task, title }));
    }
    const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
    if (req.method === 'GET' && exportMatch) {
      const project = getProject.get(exportMatch[1]);
      if (!project) return send(404, JSON.stringify({ error: 'Project not found' }));
      const tasks = listTasks.all(project.id).map(task => ({
        title: task.title,
        completed: Boolean(task.completed),
        priority: task.priority || 'Normal',
        dueDate: task.dueDate || '',
        notes: (task.notes || '').replace(/\\r\\n?/g, '\\n'),
        deleted: Boolean(task.deleted)
      }));
      const document = {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.defaultPriority || 'Normal',
          tasks
        }
      };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workboard-project.json"',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(JSON.stringify(document));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectMatch) {
      const project = getProject.get(projectMatch[1]);
      return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Project not found' }));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/directory' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) return send(200, indexHtml, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/app.js') return send(200, appJs, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/style.css') return send(200, appCss, 'text/css; charset=utf-8');
    return send(404, JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    return send(500, JSON.stringify({ error: 'Internal server error' }));
  }
});

function validateProjectDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== 'workboard-project' || value.version !== 1 || !Number.isInteger(value.version)) return null;
  const project = value.project;
  if (!project || typeof project !== 'object' || Array.isArray(project) || typeof project.name !== 'string' || !project.name.trim() || typeof project.archived !== 'boolean' || !['Low', 'Normal', 'High'].includes(project.defaultPriority) || !Array.isArray(project.tasks)) return null;
  const tasks = [];
  for (const task of project.tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.title !== 'string' || !task.title.trim() || typeof task.completed !== 'boolean' || !['Low', 'Normal', 'High'].includes(task.priority) || typeof task.dueDate !== 'string' || (task.dueDate !== '' && !isValidDueDate(task.dueDate)) || typeof task.notes !== 'string' || typeof task.deleted !== 'boolean') return null;
    tasks.push(task);
  }
  return { project: { archived: project.archived, defaultPriority: project.defaultPriority, tasks } };
}

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
