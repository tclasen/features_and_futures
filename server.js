import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'workboard.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0,
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
db.exec(`UPDATE tasks SET sort_order = id WHERE sort_order = 0;
CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, sort_order FROM tasks;`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
  COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`);
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC');
const addTask = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE project_id = ?), 0))');
const getRememberedPosition = db.prepare('SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM task_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT OR IGNORE INTO task_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const setTaskCompleted = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const setTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const setTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

const html = await readFile(path.join(root, 'index.html'));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/health' && req.method === 'GET') {
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }));
    }
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      return send(200, 'application/json; charset=utf-8', JSON.stringify(listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0)));
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch && req.method === 'PATCH') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let data; try { data = JSON.parse(raw); } catch { data = {}; }
      const project = getProject.get(Number(projectMatch[1]));
      if (!project) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
      if (Object.hasOwn(data, 'defaultPriority')) {
        if (!['Low', 'Normal', 'High'].includes(data.defaultPriority)) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid default task priority' }));
        if (project.archived) return send(403, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        setDefaultPriority.run(data.defaultPriority, project.id);
      } else if (Object.hasOwn(data, 'name')) {
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
        if (project.archived) return send(403, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
        renameProject.run(name, project.id);
      } else {
        setArchived.run(data.archived ? 1 : 0, project.id);
      }
      return send(200, 'application/json; charset=utf-8', JSON.stringify(getProject.get(project.id)));
    }
    if (projectMatch && req.method === 'GET') {
      const project = getProject.get(Number(projectMatch[1]));
      if (!project) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
      return send(200, 'application/json; charset=utf-8', JSON.stringify(project));
    }
    const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
    if (tasksMatch && req.method === 'GET') {
      if (!getProject.get(Number(tasksMatch[1]))) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
      return send(200, 'application/json; charset=utf-8', JSON.stringify(listTasks.all(Number(tasksMatch[1]))));
    }
    if (tasksMatch && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let data; try { data = JSON.parse(raw); } catch { data = {}; }
      const projectId = Number(tasksMatch[1]);
      const owningProject = getProject.get(projectId);
      if (!owningProject) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project not found' }));
      if (owningProject.archived) return send(403, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
      const result = addTask.run(projectId, title, owningProject.defaultPriority, projectId);
      rememberPosition.run(Number(result.lastInsertRowid), projectId, nextPosition.get(projectId).position);
      return send(201, 'application/json; charset=utf-8', JSON.stringify(getTask.get(Number(result.lastInsertRowid), projectId)));
    }
    const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
    if (moveMatch && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let data; try { data = JSON.parse(raw); } catch { data = {}; }
      const sourceId = Number(moveMatch[1]), taskId = Number(moveMatch[2]), destinationId = Number(data.destinationProjectId);
      const source = getProject.get(sourceId), destination = getProject.get(destinationId);
      if (!source || !destination || !getTask.get(taskId, sourceId)) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task or project not found' }));
      if (source.archived || destination.archived || sourceId === destinationId) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid move destination' }));
      const remembered = getRememberedPosition.get(taskId, destinationId);
      const position = remembered ? remembered.position : nextPosition.get(destinationId).position;
      rememberPosition.run(taskId, destinationId, position);
      moveTask.run(destinationId, position, taskId, sourceId);
      return send(200, 'application/json; charset=utf-8', JSON.stringify(getTask.get(taskId, destinationId)));
    }
    const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
    if (taskMatch && req.method === 'PATCH') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let data; try { data = JSON.parse(raw); } catch { data = {}; }
      const projectId = Number(taskMatch[1]), taskId = Number(taskMatch[2]);
      if (!getTask.get(taskId, projectId)) return send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task not found' }));
      if (getProject.get(projectId).archived) return send(403, 'application/json; charset=utf-8', JSON.stringify({ error: 'Archived project' }));
      if (Object.hasOwn(data, 'dueDate')) {
        const value = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
        if (value && !isValidDate(value)) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
        setTaskDueDate.run(value || null, taskId, projectId);
      } else if (Object.hasOwn(data, 'title')) {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Task title is required' }));
        renameTask.run(title, taskId, projectId);
      } else if (Object.hasOwn(data, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(data.priority)) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid task priority' }));
        setTaskPriority.run(data.priority, taskId, projectId);
      } else {
        setTaskCompleted.run(data.completed ? 1 : 0, taskId, projectId);
      }
      return send(200, 'application/json; charset=utf-8', JSON.stringify(getTask.get(taskId, projectId)));
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(400, 'application/json; charset=utf-8', JSON.stringify({ error: 'Project name is required' }));
      const result = addProject.run(name);
      return send(201, 'application/json; charset=utf-8', JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
      return send(200, 'text/html; charset=utf-8', html);
    }
    send(404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    console.error(error);
    send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'Internal server error' }));
  }
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
