import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(root, 'workboard.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    default_priority TEXT NOT NULL DEFAULT 'Normal',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    task_order INTEGER
  );
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
`);
// Upgrade databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'task_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN task_order INTEGER');
}
if (!taskColumns.some((column) => column.name === 'notes')) {
  database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!taskColumns.some((column) => column.name === 'deleted')) {
  database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
}
database.exec(`
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id) - 1 AS position
    FROM tasks WHERE task_order IS NULL
  )
  UPDATE tasks SET task_order = (SELECT position FROM ordered WHERE ordered.id = tasks.id)
  WHERE task_order IS NULL
`);
// Keep each task's slot in every project it has belonged to. Existing tasks
// start with a remembered slot matching their current order.
database.exec(`
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
  SELECT id, project_id, task_order FROM tasks
`);

function isValidDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

async function serveFile(response, filename, contentType) {
  try {
    const content = await readFile(path.join(root, filename));
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }

  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return json(response, 200, database.prepare(`
      SELECT p.id, p.name, p.archived,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted = 0) AS totalCount,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1 AND deleted = 0) AS completedCount
      FROM projects p ORDER BY p.id
    `).all().map((project) => ({ ...project, archived: Boolean(project.archived) })));
  }

  if (url.pathname === '/api/projects' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (request.method === 'GET' && exportMatch) {
    const projectId = Number(exportMatch[1]);
    const project = database.prepare(`
      SELECT name, archived, default_priority AS defaultPriority
      FROM projects WHERE id = ?
    `).get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    const tasks = database.prepare(`
      SELECT title, completed, priority, due_date AS dueDate, notes, deleted
      FROM tasks WHERE project_id = ? ORDER BY task_order, id
    `).all(projectId).map((task) => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: (task.notes || '').replace(/\r\n?/g, '\n'),
      deleted: Boolean(task.deleted),
    }));
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="workboard-project.json"',
    });
    return response.end(JSON.stringify({
      format: 'workboard-project',
      version: 1,
      project: {
        name: project.name,
        archived: Boolean(project.archived),
        defaultPriority: project.defaultPriority || 'Normal',
        tasks,
      },
    }));
  }

  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived projects cannot be changed' });

    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      if (Object.hasOwn(input, 'defaultPriority')) {
        const priorities = ['Low', 'Normal', 'High'];
        if (!priorities.includes(input.defaultPriority)) return json(response, 400, { error: 'Invalid default task priority' });
        database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(input.defaultPriority, projectId);
        return json(response, 200, { id: projectId, defaultPriority: input.defaultPriority });
      }
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return json(response, 400, { error: 'Project name is required' });
      database.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, projectId);
      return json(response, 200, { id: projectId, name });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = Boolean(project.archived);
    return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
  }

  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (archiveMatch && request.method === 'POST') {
    const archived = archiveMatch[2] === 'archive';
    const result = database.prepare('UPDATE projects SET archived = ? WHERE id = ?')
      .run(archived ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) return json(response, 404, { error: 'Project not found' });
    return json(response, 200, { id: Number(archiveMatch[1]), archived });
  }

  const projectTasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (projectTasksMatch && request.method === 'GET') {
    const projectId = Number(projectTasksMatch[1]);
    const project = database.prepare('SELECT id, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    return json(response, 200, database.prepare(
      'SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY task_order, id'
    ).all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }

  if (projectTasksMatch && request.method === 'POST') {
    const projectId = Number(projectTasksMatch[1]);
    const project = database.prepare('SELECT id, archived, default_priority AS defaultPriority FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived projects cannot have new tasks' });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return json(response, 400, { error: 'Task title is required' });
      const position = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_project_positions WHERE project_id = ?').get(projectId).next;
      const result = database.prepare('INSERT INTO tasks (project_id, title, priority, task_order) VALUES (?, ?, ?, ?)')
        .run(projectId, title, project.defaultPriority, position);
      database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)')
        .run(Number(result.lastInsertRowid), projectId, position);
      return json(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultPriority });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveMatch && request.method === 'POST') {
    const sourceId = Number(moveMatch[1]);
    const taskId = Number(moveMatch[2]);
    const source = database.prepare('SELECT archived FROM projects WHERE id = ?').get(sourceId);
    if (!source) return json(response, 404, { error: 'Project not found' });
    if (source.archived) return json(response, 409, { error: 'Archived projects cannot move tasks' });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      const destinationId = Number(input.destinationProjectId);
      const destination = database.prepare('SELECT id, archived FROM projects WHERE id = ?').get(destinationId);
      if (!destination || destination.archived || destinationId === sourceId) {
        return json(response, 400, { error: 'Invalid destination project' });
      }
      const task = database.prepare('SELECT id, deleted FROM tasks WHERE id = ? AND project_id = ?').get(taskId, sourceId);
      if (!task) return json(response, 404, { error: 'Task not found' });
      if (task.deleted) return json(response, 409, { error: 'Deleted tasks cannot be moved' });
      let position = database.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?')
        .get(taskId, destinationId)?.position;
      if (position === undefined) {
        position = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_project_positions WHERE project_id = ?')
          .get(destinationId).next;
        database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)')
          .run(taskId, destinationId, position);
      }
      database.prepare('UPDATE tasks SET project_id = ?, task_order = ? WHERE id = ?').run(destinationId, position, taskId);
      return json(response, 200, { id: taskId, projectId: destinationId });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  const deletionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/(delete|restore)$/);
  if (deletionMatch && request.method === 'POST') {
    const [, projectText, taskText, action] = deletionMatch;
    const projectId = Number(projectText);
    const taskId = Number(taskText);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project.archived) return json(response, 409, { error: 'Archived projects cannot change task deletion state' });
    const result = database.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?')
      .run(action === 'delete' ? 1 : 0, taskId, projectId);
    if (!result.changes) return json(response, 404, { error: 'Task not found' });
    return json(response, 200, { id: taskId, deleted: action === 'delete' });
  }

  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = database.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!project) return json(response, 404, { error: 'Project not found' });
    if (project?.archived) return json(response, 409, { error: 'Archived project tasks cannot be changed' });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return json(response, 400, { error: 'Invalid request body' });
      }
      const task = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?')
        .get(taskId, projectId);
      if (!task) return json(response, 404, { error: 'Task not found' });
      if (database.prepare('SELECT deleted FROM tasks WHERE id = ?').get(taskId).deleted) {
        return json(response, 409, { error: 'Deleted tasks cannot be edited' });
      }

      if (Object.hasOwn(input, 'title')) {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return json(response, 400, { error: 'Task title is required' });
        database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, taskId, projectId);
        return json(response, 200, { id: taskId, projectId, title, completed: Boolean(task.completed) });
      }
      if (Object.hasOwn(input, 'priority')) {
        const priorities = ['Low', 'Normal', 'High'];
        if (!priorities.includes(input.priority)) return json(response, 400, { error: 'Invalid task priority' });
        database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?')
          .run(input.priority, taskId, projectId);
        return json(response, 200, { id: taskId, projectId, priority: input.priority });
      }
      if (Object.hasOwn(input, 'dueDate')) {
        const dueDate = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
        if (dueDate && !isValidDueDate(dueDate)) {
          return json(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        }
        const canonicalDate = dueDate || null;
        database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?')
          .run(canonicalDate, taskId, projectId);
        return json(response, 200, { id: taskId, projectId, dueDate: canonicalDate });
      }
      if (Object.hasOwn(input, 'notes')) {
        if (typeof input.notes !== 'string') return json(response, 400, { error: 'Task notes must be text' });
        database.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?')
          .run(input.notes, taskId, projectId);
        return json(response, 200, { id: taskId, projectId, notes: input.notes });
      }
      if (typeof input.completed !== 'boolean') return json(response, 400, { error: 'Completion state is required' });
      database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
        .run(input.completed ? 1 : 0, taskId, projectId);
      return json(response, 200, { id: taskId, projectId, completed: input.completed });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'Invalid JSON' });
      throw error;
    }
  }

  if (request.method === 'GET' && url.pathname === '/') {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    return serveFile(response, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    return serveFile(response, 'styles.css', 'text/css; charset=utf-8');
  }
  if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
    return serveFile(response, 'index.html', 'text/html; charset=utf-8');
  }

  response.writeHead(404);
  response.end('Not found');
});

const port = Number.parseInt(process.env.PORT || '8080', 10);
server.listen(port, '0.0.0.0');

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
