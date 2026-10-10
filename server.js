import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT ?? 8080);
const dbPath = resolve(process.env.DB_PATH ?? './workboard.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  ;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const taskColumns = database.prepare("PRAGMA table_info(tasks)").all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  database.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER');
  database.exec('UPDATE tasks SET sort_order = id WHERE sort_order IS NULL');
}
const projectColumns = database.prepare("PRAGMA table_info(projects)").all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
// Keep each task's position in every project it has visited. The task row only
// records its current project, while this table preserves return positions.
database.exec(`
  CREATE TABLE IF NOT EXISTS project_task_positions (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (project_id, task_id),
    UNIQUE (project_id, position)
  );
  INSERT OR IGNORE INTO project_task_positions (project_id, task_id, position)
  SELECT project_id, id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY sort_order, id)
  FROM tasks;
`);

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_priority AS defaultPriority,
  COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const updateProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const addTask = database.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE project_id = ?), 1))');
const addTaskPosition = database.prepare(`INSERT INTO project_task_positions (project_id, task_id, position)
  VALUES (?, ?, COALESCE((SELECT MAX(position) + 1 FROM project_task_positions WHERE project_id = ?), 1))`);
const updateTaskCompletion = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const getTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const getTaskPosition = database.prepare('SELECT position FROM project_task_positions WHERE project_id = ? AND task_id = ?');
const addProjectTaskPosition = database.prepare(`INSERT INTO project_task_positions (project_id, task_id, position)
  VALUES (?, ?, COALESCE((SELECT MAX(position) + 1 FROM project_task_positions WHERE project_id = ?), 1))`);
const moveTask = database.prepare('UPDATE tasks SET project_id = ? WHERE id = ? AND project_id = ?');
const listProjectTaskIds = database.prepare(`SELECT t.id FROM tasks t
  JOIN project_task_positions p ON p.task_id = t.id AND p.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY p.position, t.id`);
const setTaskOrder = database.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');

function reorderTasks(projectId) {
  listProjectTaskIds.all(projectId).forEach((task, index) => setTaskOrder.run(index + 1, task.id));
}

function moveTaskToProject(taskId, sourceId, destinationId) {
  if (!getTask.get(taskId, sourceId)) return { changes: 0 };
  database.exec('BEGIN');
  try {
    if (!getTaskPosition.get(destinationId, taskId)) {
      addProjectTaskPosition.run(destinationId, taskId, destinationId);
    }
    const result = moveTask.run(destinationId, taskId, sourceId);
    if (result.changes) {
      reorderTasks(sourceId);
      reorderTasks(destinationId);
    }
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const appHtml = await readFile(new URL('./index.html', import.meta.url));
const appJs = await readFile(new URL('./app.js', import.meta.url));
const appCss = await readFile(new URL('./styles.css', import.meta.url));

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    return sendJson(response, 200, listProjects.all().map((project) => ({ ...project, archived: Boolean(project.archived) })));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const data = await readJson(request);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, { ...project, archived: Boolean(project.archived) }) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    const data = await readJson(request);
    if (['Low', 'Normal', 'High'].includes(data?.defaultPriority)) {
      updateProjectDefaultPriority.run(data.defaultPriority, projectId);
      return sendJson(response, 200, { id: projectId, defaultPriority: data.defaultPriority });
    }
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, { id: projectId, name });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const data = await readJson(request);
    if (typeof data?.archived !== 'boolean') return sendJson(response, 400, { error: 'Archive state must be a boolean' });
    const result = setProjectArchived.run(data.archived ? 1 : 0, projectId);
    return result.changes ? sendJson(response, 200, { id: projectId, archived: data.archived }) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    return sendJson(response, 200, listTasks.all(projectId).map((task) => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot have new tasks' });
    const data = await readJson(request);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) return sendJson(response, 400, { error: 'Task title is required' });
    const result = addTask.run(projectId, title, project.defaultPriority, projectId);
    const taskId = Number(result.lastInsertRowid);
    addTaskPosition.run(projectId, taskId, projectId);
    return sendJson(response, 201, { id: taskId, projectId, title, completed: false, priority: project.defaultPriority });
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (moveMatch && request.method === 'POST') {
    const sourceId = Number(moveMatch[1]);
    const taskId = Number(moveMatch[2]);
    const source = getProject.get(sourceId);
    if (!source) return sendJson(response, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(response, 409, { error: 'Archived projects cannot move tasks' });
    const data = await readJson(request);
    const destinationId = Number(data?.destinationProjectId);
    const destination = getProject.get(destinationId);
    if (!destination || destination.archived || destinationId === sourceId) {
      return sendJson(response, 400, { error: 'Choose an active destination project' });
    }
    const result = moveTaskToProject(taskId, sourceId, destinationId);
    return result.changes ? sendJson(response, 200, { id: taskId, sourceProjectId: sourceId, destinationProjectId: destinationId }) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (taskMatch && request.method === 'PATCH') {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = getProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const data = await readJson(request);
    if (typeof data?.title === 'string') {
      const title = data.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = renameTask.run(title, taskId, projectId);
      return result.changes ? sendJson(response, 200, { id: taskId, projectId, title }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof data?.priority === 'string') {
      if (!['Low', 'Normal', 'High'].includes(data.priority)) return sendJson(response, 400, { error: 'Priority must be Low, Normal, or High' });
      const result = updateTaskPriority.run(data.priority, taskId, projectId);
      return result.changes ? sendJson(response, 200, { id: taskId, projectId, priority: data.priority }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (Object.hasOwn(data ?? {}, 'dueDate')) {
      let dueDate = null;
      if (typeof data.dueDate === 'string' && data.dueDate.trim()) {
        dueDate = data.dueDate.trim();
        if (!isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      } else if (data.dueDate !== null && typeof data.dueDate !== 'string') {
        return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      }
      const result = updateTaskDueDate.run(dueDate, taskId, projectId);
      return result.changes ? sendJson(response, 200, { id: taskId, projectId, dueDate }) : sendJson(response, 404, { error: 'Task not found' });
    }
    if (typeof data?.completed !== 'boolean') return sendJson(response, 400, { error: 'Completion must be a boolean' });
    const result = updateTaskCompletion.run(data.completed ? 1 : 0, taskId, projectId);
    return result.changes ? sendJson(response, 200, { id: taskId, projectId, completed: data.completed }) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && url.pathname === '/app.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(appJs);
  }
  if (request.method === 'GET' && url.pathname === '/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return response.end(appCss);
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(appHtml);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
