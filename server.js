import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.DB_PATH || join(directory, 'workboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
  )
`);

// Upgrade older databases before preparing statements that use newer columns.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_task_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!taskColumns.some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}

// Keep a position for every task in every project it has belonged to. A task's
// current project remains on tasks; this table also remembers prior positions.
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id),
    UNIQUE (project_id, position)
  );
  INSERT INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id) - 1
  FROM tasks
  WHERE NOT EXISTS (SELECT 1 FROM task_project_positions);
`);

const listProjects = database.prepare(`
  SELECT p.id, p.name, p.archived,
    COUNT(CASE WHEN t.deleted = 0 THEN t.id END) AS total_count,
    COALESCE(SUM(CASE WHEN t.deleted = 0 THEN t.completed ELSE 0 END), 0) AS completed_count
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
`);
const findProject = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
const exportProjectTasks = database.prepare(`SELECT t.title, t.completed, t.priority, t.due_date, t.notes, t.deleted
  FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position`);
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
const setTaskDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const listTasks = database.prepare(`SELECT t.id, t.title, t.completed, t.priority, t.due_date, t.notes, t.deleted
  FROM tasks t JOIN task_project_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position`);
const listDirectoryTasks = database.prepare(`SELECT t.id, t.title, t.completed, t.priority,
    t.due_date, t.notes, t.deleted, p.id AS project_id, p.name AS project_name,
    p.archived AS project_archived
  FROM projects p JOIN task_project_positions pos ON pos.project_id = p.id
  JOIN tasks t ON t.id = pos.task_id AND t.project_id = p.id
  ORDER BY p.id, pos.position`);
const findTask = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTaskNotes = database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
function moveTask(taskId, sourceProjectId, destinationProjectId) {
  const task = findTask.get(taskId, sourceProjectId);
  if (!task) return null;
  database.exec('BEGIN');
  try {
    const rememberedPosition = database.prepare(`SELECT position FROM task_project_positions
      WHERE task_id = ? AND project_id = ?`).get(taskId, destinationProjectId);
    if (!rememberedPosition) {
      const nextPosition = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?')
        .get(destinationProjectId).value;
      database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)')
        .run(taskId, destinationProjectId, nextPosition);
    }
    database.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?')
      .run(destinationProjectId, taskId, sourceProjectId);
    const movedTask = findTask.get(taskId, destinationProjectId);
    database.exec('COMMIT');
    return movedTask;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidPortableProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.format !== 'workboard-project' || value.version !== 1
    || !value.project || typeof value.project !== 'object' || Array.isArray(value.project)) return false;
  const project = value.project;
  if (typeof project.name !== 'string' || !project.name.trim()
    || typeof project.archived !== 'boolean'
    || !['Low', 'Normal', 'High'].includes(project.defaultPriority)
    || !Array.isArray(project.tasks)) return false;
  return project.tasks.every((task) => task && typeof task === 'object' && !Array.isArray(task)
    && typeof task.title === 'string' && Boolean(task.title.trim())
    && typeof task.completed === 'boolean'
    && ['Low', 'Normal', 'High'].includes(task.priority)
    && typeof task.dueDate === 'string' && (!task.dueDate || isValidDueDate(task.dueDate))
    && typeof task.notes === 'string'
    && typeof task.deleted === 'boolean');
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(project = null) {
  const template = readFileSync(join(directory, 'index.html'), 'utf8');
  const initialProject = project ? JSON.stringify(project).replace(/</g, '\\u003c') : 'null';
  return template.replace('<!-- PROJECT_DATA -->', `<script>window.initialProject = ${initialProject};</script>`)
    .replace('<!-- PROJECT_HEADING -->', project ? escapeHtml(project.name) : '');
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  const projectExportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (request.method === 'GET' && projectExportMatch) {
    const project = findProject.get(Number(projectExportMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const document = {
      format: 'workboard-project',
      version: 1,
      project: {
        name: project.name,
        archived: Boolean(project.archived),
        defaultPriority: project.default_task_priority || 'Normal',
        tasks: exportProjectTasks.all(project.id).map((task) => ({
          title: task.title,
          completed: Boolean(task.completed),
          priority: task.priority || 'Normal',
          dueDate: task.due_date || '',
          notes: (task.notes || '').replace(/\r\n?/g, '\n'),
          deleted: Boolean(task.deleted),
        })),
      },
    };
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="workboard-project.json"',
    });
    return response.end(JSON.stringify(document));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  }
  if (request.method === 'GET' && url.pathname === '/api/directory') {
    return sendJson(response, 200, listDirectoryTasks.all());
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (request.method === 'POST' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    setProjectArchived.run(archiveMatch[2] === 'archive' ? 1 : 0, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/rename$/);
  if (request.method === 'POST' && renameMatch) {
    const projectId = Number(renameMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be renamed' });
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      renameProject.run(name, projectId);
      return sendJson(response, 200, findProject.get(projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    const projectId = Number(defaultPriorityMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived projects cannot be changed' });
    try {
      const payload = await readJson(request);
      if (!['Low', 'Normal', 'High'].includes(payload.priority)) {
        return sendJson(response, 400, { error: 'A valid task priority is required' });
      }
      updateProjectDefaultPriority.run(payload.priority, projectId);
      return sendJson(response, 200, findProject.get(projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return sendJson(response, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return sendJson(response, 201, findProject.get(result.lastInsertRowid));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/projects/import') {
    let payload;
    try {
      payload = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid project JSON' });
    }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    if (!isValidPortableProject(payload.document)) {
      return sendJson(response, 400, { error: 'Invalid project JSON' });
    }
    const imported = payload.document.project;
    database.exec('BEGIN');
    try {
      const projectResult = database.prepare(`INSERT INTO projects (name, archived, default_task_priority)
        VALUES (?, ?, ?)`).run(name, imported.archived ? 1 : 0, imported.defaultPriority);
      const projectId = Number(projectResult.lastInsertRowid);
      const insertTask = database.prepare(`INSERT INTO tasks
        (project_id, title, completed, priority, due_date, notes, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const insertPosition = database.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
        VALUES (?, ?, ?)`);
      imported.tasks.forEach((task, position) => {
        const taskResult = insertTask.run(projectId, task.title, task.completed ? 1 : 0,
          task.priority, task.dueDate || null, task.notes, task.deleted ? 1 : 0);
        insertPosition.run(taskResult.lastInsertRowid, projectId, position);
      });
      database.exec('COMMIT');
      return sendJson(response, 201, findProject.get(projectId));
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      try {
        if (findProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived projects cannot have tasks' });
        const payload = await readJson(request);
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) return sendJson(response, 400, { error: 'Task title is required' });
        const project = findProject.get(projectId);
        const result = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)')
          .run(projectId, title, project.default_task_priority);
        const position = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?')
          .get(projectId).value;
        database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)')
          .run(result.lastInsertRowid, projectId, position);
        return sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
      } catch {
        return sendJson(response, 400, { error: 'Invalid request' });
      }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    try {
      if (findProject.get(projectId).archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
      const payload = await readJson(request);
      let result;
      if (typeof payload.completed === 'boolean') {
        result = updateTaskCompletion.run(payload.completed ? 1 : 0, taskId, projectId);
      } else if (['Low', 'Normal', 'High'].includes(payload.priority)) {
        result = updateTaskPriority.run(payload.priority, taskId, projectId);
      } else {
        return sendJson(response, 400, { error: 'A valid completion or priority is required' });
      }
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const dueDateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
  if (request.method === 'POST' && dueDateMatch) {
    const projectId = Number(dueDateMatch[1]);
    const taskId = Number(dueDateMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    try {
      const payload = await readJson(request);
      const dueDate = typeof payload.due_date === 'string' ? payload.due_date.trim() : '';
      if (dueDate && !isValidDueDate(dueDate)) {
        return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      }
      const result = updateTaskDueDate.run(dueDate || null, taskId, projectId);
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const taskNotesMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/notes$/);
  if (request.method === 'POST' && taskNotesMatch) {
    const projectId = Number(taskNotesMatch[1]);
    const taskId = Number(taskNotesMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    try {
      const payload = await readJson(request);
      if (typeof payload.notes !== 'string') return sendJson(response, 400, { error: 'Task notes must be text' });
      const result = updateTaskNotes.run(payload.notes, taskId, projectId);
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const renameTaskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/rename$/);
  if (request.method === 'POST' && renameTaskMatch) {
    const projectId = Number(renameTaskMatch[1]);
    const taskId = Number(renameTaskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    try {
      const payload = await readJson(request);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = renameTask.run(title, taskId, projectId);
      if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, findTask.get(taskId, projectId));
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  const taskDeletionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/(delete|restore)$/);
  if (request.method === 'POST' && taskDeletionMatch) {
    const projectId = Number(taskDeletionMatch[1]);
    const taskId = Number(taskDeletionMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 400, { error: 'Archived project tasks cannot be changed' });
    const result = setTaskDeleted.run(taskDeletionMatch[3] === 'delete' ? 1 : 0, taskId, projectId);
    if (!Number(result.changes)) return sendJson(response, 404, { error: 'Task not found' });
    return sendJson(response, 200, findTask.get(taskId, projectId));
  }
  const moveTaskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (request.method === 'POST' && moveTaskMatch) {
    const sourceProjectId = Number(moveTaskMatch[1]);
    const taskId = Number(moveTaskMatch[2]);
    const source = findProject.get(sourceProjectId);
    if (!source) return sendJson(response, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(response, 400, { error: 'Archived projects cannot move tasks' });
    try {
      const payload = await readJson(request);
      const destinationProjectId = Number(payload.destination_project_id);
      const destination = findProject.get(destinationProjectId);
      const task = findTask.get(taskId, sourceProjectId);
      if (task?.deleted) return sendJson(response, 400, { error: 'Deleted tasks cannot be moved' });
      if (!destination || destination.archived || destinationProjectId === sourceProjectId) {
        return sendJson(response, 400, { error: 'A different active destination project is required' });
      }
      const movedTask = moveTask(taskId, sourceProjectId, destinationProjectId);
      if (!movedTask) return sendJson(response, 404, { error: 'Task not found' });
      return sendJson(response, 200, movedTask);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page());
  }
  if (request.method === 'GET' && url.pathname === '/directory') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page().replace('<!-- DIRECTORY_MODE -->', '<script>window.directoryMode = true;</script>'));
  }
  const projectMatch = url.pathname.match(/^\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    if (!project) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Project not found');
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page(project));
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    // Keep one malformed request or an unexpected database error from taking
    // down the whole service (and resetting unrelated health/restart checks).
    console.error('Request failed:', error);
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    sendJson(response, 500, { error: 'Internal server error' });
  });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    database.close();
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
