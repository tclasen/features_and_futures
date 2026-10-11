import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
)`);
if (!database.prepare("PRAGMA table_info(projects)").all().some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!database.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const getProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefault = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
database.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET sort_order = id');
}
database.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (project_id, task_id),
  UNIQUE (project_id, sort_order)
)`);
database.exec(`INSERT OR IGNORE INTO task_project_positions (project_id, task_id, sort_order)
  SELECT project_id, id, sort_order FROM tasks ORDER BY sort_order, id`);
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const createTask = database.prepare("INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, (SELECT default_priority FROM projects WHERE id = ?), COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE project_id = ?), 1))");
const rememberPosition = database.prepare('INSERT INTO task_project_positions (project_id, task_id, sort_order) VALUES (?, ?, ?)');
const getRememberedPosition = database.prepare('SELECT sort_order AS sortOrder FROM task_project_positions WHERE project_id = ? AND task_id = ?');
const nextProjectPosition = database.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?');
const updateTaskProject = database.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const root = path.dirname(new URL(import.meta.url).pathname);
const send = (res, status, body, contentType = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, JSON.stringify(listProjects.all()));
  }
  const renameRoute = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (renameRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const bodyData = JSON.parse(body);
      const id = Number(renameRoute[1]);
      const project = getProject.get(id);
      if (!project) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      if (Object.hasOwn(bodyData, 'defaultPriority')) {
        if (!['Low', 'Normal', 'High'].includes(bodyData.defaultPriority)) return send(res, 400, JSON.stringify({ error: 'Invalid default priority' }));
        if (project.archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        updateProjectDefault.run(bodyData.defaultPriority, id);
      } else {
        const name = String(bodyData.name ?? '').trim();
        if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
        if (project.archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        renameProject.run(name, id);
      }
      return send(res, 200, JSON.stringify(getProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archiveRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveRoute && req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const archived = JSON.parse(body).archived;
      if (typeof archived !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid archive state' }));
      const id = Number(archiveRoute[1]);
      const result = setProjectArchived.run(archived ? 1 : 0, id);
      if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
      return send(res, 200, JSON.stringify(getProject.get(id)));
    } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(res, 201, JSON.stringify(getProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+)(\/move)?)?$/);
  if (taskRoute) {
    const projectId = Number(taskRoute[1]);
    if (!getProject.get(projectId)) return send(res, 404, JSON.stringify({ error: 'Project not found' }));
    if (req.method === 'GET' && !taskRoute[2]) return send(res, 200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !taskRoute[2]) {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const title = String(JSON.parse(body).title ?? '').trim();
        if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
        const result = createTask.run(projectId, title, projectId, projectId);
        const taskId = Number(result.lastInsertRowid);
        const position = nextProjectPosition.get(projectId).position;
        rememberPosition.run(projectId, taskId, position);
        database.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?').run(position, taskId);
        return send(res, 201, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (req.method === 'PATCH' && taskRoute[2] && taskRoute[3]) {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const destinationId = Number(JSON.parse(body).destinationProjectId);
        const source = getProject.get(projectId);
        const destination = getProject.get(destinationId);
        if (source.archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        if (!destination || destination.archived || destinationId === projectId) return send(res, 400, JSON.stringify({ error: 'Invalid destination project' }));
        const taskId = Number(taskRoute[2]);
        const position = getRememberedPosition.get(destinationId, taskId)?.sortOrder ?? nextProjectPosition.get(destinationId).position;
        database.exec('BEGIN');
        try {
          const result = updateTaskProject.run(destinationId, position, taskId, projectId);
          if (!result.changes) { database.exec('ROLLBACK'); return send(res, 404, JSON.stringify({ error: 'Task not found' })); }
          if (!getRememberedPosition.get(destinationId, taskId)) rememberPosition.run(destinationId, taskId, position);
          database.exec('COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
        return send(res, 200, JSON.stringify({ success: true }));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
    if (req.method === 'PATCH' && taskRoute[2]) {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const bodyData = JSON.parse(body);
        if (getProject.get(projectId).archived) return send(res, 403, JSON.stringify({ error: 'Project is archived' }));
        const taskId = Number(taskRoute[2]);
        if (Object.hasOwn(bodyData, 'notes')) {
          if (typeof bodyData.notes !== 'string') return send(res, 400, JSON.stringify({ error: 'Invalid notes' }));
          const result = updateTaskNotes.run(bodyData.notes, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        if (Object.hasOwn(bodyData, 'dueDate')) {
          const rawDate = String(bodyData.dueDate ?? '').trim();
          let dueDate = null;
          if (rawDate) {
            const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!match) return send(res, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
            const [, yearText, monthText, dayText] = match;
            const year = Number(yearText), month = Number(monthText), day = Number(dayText);
            const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
            const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return send(res, 400, JSON.stringify({ error: 'Due date must be a valid YYYY-MM-DD date' }));
            dueDate = rawDate;
          }
          const result = updateTaskDueDate.run(dueDate, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        if (Object.hasOwn(bodyData, 'priority')) {
          const priority = bodyData.priority;
          if (!['Low', 'Normal', 'High'].includes(priority)) return send(res, 400, JSON.stringify({ error: 'Invalid task priority' }));
          const result = updateTaskPriority.run(priority, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        if (Object.hasOwn(bodyData, 'title')) {
          const title = String(bodyData.title ?? '').trim();
          if (!title) return send(res, 400, JSON.stringify({ error: 'Task title is required' }));
          const result = renameTask.run(title, taskId, projectId);
          if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
          return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
        }
        const completed = bodyData.completed;
        if (typeof completed !== 'boolean') return send(res, 400, JSON.stringify({ error: 'Invalid completion state' }));
        const result = updateTask.run(completed ? 1 : 0, taskId, projectId);
        if (!result.changes) return send(res, 404, JSON.stringify({ error: 'Task not found' }));
        return send(res, 200, JSON.stringify(listTasks.all(projectId).find(task => task.id === taskId)));
      } catch { return send(res, 400, JSON.stringify({ error: 'Invalid request' })); }
    }
  }
  if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    const project = getProject.get(Number(url.pathname.split('/')[2]));
    if (!project) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    try {
      return send(res, 200, await readFile(path.join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Application unavailable', 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
