import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(path.resolve(dbPath));
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
const getProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const updateProjectDefault = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
try {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER');
  db.exec('UPDATE tasks SET position = id');
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COUNT(CASE WHEN t.deleted = 0 THEN t.id END) AS totalCount, COALESCE(SUM(CASE WHEN t.deleted = 0 THEN t.completed ELSE 0 END), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE project_id = ?), 1))');
const getTaskPosition = db.prepare('SELECT position FROM tasks WHERE id = ?');
const eligibleDestinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id != ? ORDER BY id');
const rememberedPosition = db.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position) + 1, 1) AS position FROM task_project_positions WHERE project_id = ?');
const rememberPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const setTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const json = (res, status, value) => send(res, status, JSON.stringify(value));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/api/projects' && req.method === 'GET') return json(res, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (exportMatch && req.method === 'GET') {
    const id = Number(exportMatch[1]);
    const project = getProject.get(id);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const tasks = listTasks.all(id).map(task => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: (task.notes || '').replace(/\\r\\n?/g, '\\n'),
      deleted: Boolean(task.deleted)
    }));
    const document = { format: 'workboard-project', version: 1, project: {
      name: project.name, archived: Boolean(project.archived),
      defaultPriority: project.defaultPriority || 'Normal', tasks
    } };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="workboard-project.json"',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(JSON.stringify(document));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (typeof data.archived !== 'boolean') return json(res, 400, { error: 'Invalid archive state' });
      const id = Number(archiveMatch[1]);
      if (!getProject.get(id)) return json(res, 404, { error: 'Project not found' });
      setArchived.run(data.archived ? 1 : 0, id);
      return json(res, 200, { ...getProject.get(id), archived: data.archived });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = addProject.run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const defaultMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return json(res, 400, { error: 'Invalid priority' });
      const id = Number(defaultMatch[1]);
      const project = getProject.get(id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot be changed' });
      updateProjectDefault.run(data.priority, id);
      return json(res, 200, getProject.get(id));
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET' && url.searchParams.has('destinations')) return json(res, 200, eligibleDestinations.all(Number(tasksMatch[1])));
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const projectId = Number(tasksMatch[1]);
      const project = getProject.get(projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot accept tasks' });
      const result = addTask.run(projectId, title, project.defaultPriority, projectId);
      const taskId = Number(result.lastInsertRowid);
      rememberPosition.run(taskId, projectId, getTaskPosition.get(taskId).position);
      return json(res, 201, { id: taskId, projectId, title, completed: false, priority: project.defaultPriority });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { destinationId } = JSON.parse(body);
      const sourceId = Number(moveMatch[1]), taskId = Number(moveMatch[2]), targetId = Number(destinationId);
      const source = getProject.get(sourceId), target = getProject.get(targetId);
      if (!source || !target || source.archived || target.archived || getTask.get(taskId, sourceId)?.deleted) return json(res, 400, { error: 'Invalid move' });
      db.exec('BEGIN IMMEDIATE');
      try {
        let position = rememberedPosition.get(taskId, targetId)?.position;
        if (position === undefined) {
          position = nextPosition.get(targetId).position;
          rememberPosition.run(taskId, targetId, position);
        }
        moveTask.run(targetId, position, taskId, sourceId);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return json(res, 200, { status: 'ok' });
    } catch { return json(res, 400, { error: 'Invalid move' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const task = getTask.get(taskId, projectId);
      if (!task) return json(res, 404, { error: 'Task not found' });
      const project = getProject.get(projectId);
      if (project.archived) return json(res, 409, { error: 'Archived project tasks cannot be changed' });
      if (Object.hasOwn(data, 'deleted') && typeof data.deleted === 'boolean') {
        if (task.deleted && data.deleted) return json(res, 400, { error: 'Invalid task state' });
        setTaskDeleted.run(data.deleted ? 1 : 0, taskId, projectId);
      } else if (task.deleted) return json(res, 409, { error: 'Deleted tasks cannot be edited' });
      else if (Object.hasOwn(data, 'title')) {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return json(res, 400, { error: 'Task title is required' });
        renameTask.run(title, taskId, projectId);
      } else if (typeof data.completed === 'boolean') {
        updateTask.run(data.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(data.priority)) {
        updateTaskPriority.run(data.priority, taskId, projectId);
      } else if (Object.hasOwn(data, 'dueDate')) {
        const dueDate = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
        if (dueDate && !isValidDate(dueDate)) return json(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        updateTaskDueDate.run(dueDate || null, taskId, projectId);
      } else if (Object.hasOwn(data, 'notes') && typeof data.notes === 'string') {
        updateTaskNotes.run(data.notes, taskId, projectId);
      } else return json(res, 400, { error: 'Invalid task update' });
      const updatedTask = getTask.get(taskId, projectId);
      return json(res, 200, { ...updatedTask, completed: Boolean(updatedTask.completed) });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (renameMatch && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const id = Number(renameMatch[1]);
      const project = getProject.get(id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (project.archived) return json(res, 409, { error: 'Archived projects cannot be renamed' });
      renameProject.run(name, id);
      return json(res, 200, getProject.get(id));
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? json(res, 200, { ...project, archived: Boolean(project.archived) }) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    try {
      return send(res, 200, await readFile(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    } catch {
      return json(res, 500, { error: 'Application unavailable' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
