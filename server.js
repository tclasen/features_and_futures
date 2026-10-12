import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const databasePath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    default_priority TEXT NOT NULL DEFAULT 'Normal'
  )
`);
// Upgrade databases created by earlier task checkpoints.
const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) {
  database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some(column => column.name === 'default_priority')) {
  database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    position INTEGER NOT NULL DEFAULT 0
  )
`);
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) {
  database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!taskColumns.some(column => column.name === 'due_date')) {
  database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some(column => column.name === 'position')) {
  database.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  database.exec('UPDATE tasks SET position = id');
}
database.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks;
`);

const listProjects = database.prepare(`SELECT p.id, p.name, p.archived, p.default_priority,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
  FROM projects p ORDER BY p.id`);
const getProject = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setProjectArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const setProjectDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
const createTask = database.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, ?)');
const moveTask = database.prepare('UPDATE tasks SET project_id = ?, position = ? WHERE id = ? AND project_id = ?');
const getRememberedTaskPosition = database.prepare('SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextRememberedTaskPosition = database.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM task_project_positions WHERE project_id = ?');
const rememberTaskPosition = database.prepare('INSERT INTO task_project_positions (task_id, project_id, position) VALUES (?, ?, ?)');
const getTask = database.prepare('SELECT id, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = database.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');

function isValidDueDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendPage(response) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1c2634; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 56px auto; padding: 0 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; font-weight: 600; }
    input, select { box-sizing: border-box; padding: 10px 12px; border: 1px solid #aeb9c8; border-radius: 5px; font: inherit; }
    input { width: min(440px, 60vw); }
    button { padding: 10px 14px; border: 0; border-radius: 5px; background: #2459a6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194783; }
    #error { margin: 0 0 16px; color: #a32222; }
    [hidden] { display: none !important; }
    #projects { display: grid; gap: 10px; padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid #d6dde7; border-radius: 6px; background: white; }
    .project-actions { display: flex; gap: 8px; align-items: center; }
    [data-testid="project-summary"] { color: #536173; white-space: nowrap; }
    #tasks { display: grid; gap: 10px; padding: 0; list-style: none; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid #d6dde7; border-radius: 6px; background: white; }
    [data-testid="task-row"] input { width: auto; }
    [data-testid="task-row"] select { max-width: 120px; }
    [data-testid="task-row"] .due-date { width: 145px; }
    .task-title { flex: 1; }
    #detail { margin-bottom: 20px; }
    @media (max-width: 520px) { form { align-items: stretch; flex-direction: column; } input { width: 100%; } button { align-self: start; } }
  </style>
</head>
<body>
  <main>
    <p id="error" role="alert" hidden></p>
    <section id="project-list">
      <h1>Workboard</h1>
      <form id="create-form">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </form>
      <label for="project-filter">Project filter</label>
      <select id="project-filter"><option>Active</option><option>Archived</option></select>
      <form id="project-search-form">
        <label for="project-search">Project search</label>
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </form>
      <ul id="projects" aria-label="Projects"></ul>
    </section>
    <section id="detail" hidden>
      <button id="back" type="button">Projects</button>
      <h1 id="project-title"></h1>
      <p id="archived-notice" hidden>Archived project</p>
      <form id="rename-form">
        <label for="new-project-name">New project name</label>
        <input id="new-project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </form>
      <form id="task-form">
        <label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </form>
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option>All</option><option>Open</option><option>Completed</option>
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter">
        <option>All</option><option>Low</option><option>Normal</option><option>High</option>
      </select>
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority"><option>Low</option><option>Normal</option><option>High</option></select>
      <form id="task-search-form">
        <label for="task-search">Task search</label>
        <input id="task-search" type="text" autocomplete="off">
        <button type="submit">Search tasks</button>
      </form>
      <form id="due-range-form">
        <label for="due-from">Due from</label>
        <input id="due-from" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
        <label for="due-through">Due through</label>
        <input id="due-through" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
        <button type="submit">Apply due range</button>
      </form>
      <ul id="tasks" aria-label="Tasks"></ul>
    </section>
  </main>
  <script>
    const listView = document.querySelector('#project-list');
    const detailView = document.querySelector('#detail');
    const projectList = document.querySelector('#projects');
    const error = document.querySelector('#error');
    const taskList = document.querySelector('#tasks');
    let currentProjectId = null;
    let currentProjectArchived = false;
    let appliedDueFrom = '';
    let appliedDueThrough = '';
    let appliedProjectQuery = '';
    let appliedTaskQuery = '';

    function asciiLower(value) {
      return value.replace(/[A-Z]/g, character => character.toLowerCase());
    }

    function normalizeSearchText(value) {
      return asciiLower(value.replace(/[ \\t]+/g, ' '));
    }

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Unable to load projects');
      return response.json();
    }

    async function showList() {
      listView.hidden = false;
      detailView.hidden = true;
      error.hidden = true;
      projectList.replaceChildren();
      document.querySelector('#project-search').value = appliedProjectQuery;
      const selectedState = document.querySelector('#project-filter').value;
      for (const project of await loadProjects()) {
        if (Boolean(project.archived) !== (selectedState === 'Archived')) continue;
        if (!normalizeSearchText(project.name).includes(normalizeSearchText(appliedProjectQuery))) continue;
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const summary = document.createElement('span');
        summary.dataset.testid = 'project-summary';
        summary.textContent = project.completed_count + '/' + project.total_count + ' completed';
        const actions = document.createElement('div');
        actions.className = 'project-actions';
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { window.location.href = '/projects/' + encodeURIComponent(project.id); });
        actions.append(open);
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.textContent = project.archived ? 'Restore project' : 'Archive project';
        archive.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + project.id + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          if (!result.ok) throw new Error('Unable to update project');
          await showList();
        });
        actions.append(archive);
        row.append(name, summary, actions);
        projectList.append(row);
      }
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { window.location.replace('/'); return; }
      const project = await response.json();
      currentProjectId = id;
      appliedDueFrom = '';
      appliedDueThrough = '';
      appliedTaskQuery = '';
      document.querySelector('#task-search').value = '';
      document.querySelector('#due-from').value = '';
      document.querySelector('#due-through').value = '';
      listView.hidden = true;
      detailView.hidden = false;
      document.querySelector('#project-title').textContent = project.name;
      const archived = Boolean(project.archived);
      currentProjectArchived = archived;
      document.querySelector('#archived-notice').hidden = !archived;
      document.querySelector('#new-project-name').disabled = archived;
      document.querySelector('#rename-form button').disabled = archived;
      document.querySelector('#task-form button').disabled = archived;
      const defaultPriority = document.querySelector('#default-task-priority');
      defaultPriority.value = project.default_priority;
      defaultPriority.disabled = archived;
      error.hidden = true;
      await renderTasks();
    }

    async function renderTasks() {
      if (!currentProjectId) return;
      const [response, projectResponse] = await Promise.all([
        fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks'),
        fetch('/api/projects')
      ]);
      if (!response.ok || !projectResponse.ok) throw new Error('Unable to load project tasks');
      const tasks = await response.json();
      const eligibleProjects = (await projectResponse.json()).filter(project => !project.archived && String(project.id) !== String(currentProjectId));
      const filter = document.querySelector('#task-filter').value;
      const priorityFilter = document.querySelector('#priority-filter').value;
      const taskQuery = normalizeSearchText(appliedTaskQuery);
      taskList.replaceChildren();
      for (const task of tasks) {
        if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
        if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
        if (!normalizeSearchText(task.title).includes(taskQuery)) continue;
        if ((appliedDueFrom || appliedDueThrough) && !task.due_date) continue;
        if (task.due_date && appliedDueFrom && task.due_date < appliedDueFrom) continue;
        if (task.due_date && appliedDueThrough && task.due_date > appliedDueThrough) continue;
        const row = document.createElement('li');
        row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = currentProjectArchived;
        checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => {
          const updated = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          if (!updated.ok) throw new Error('Unable to update task');
          await renderTasks();
        });
        const title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.title;
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.disabled = currentProjectArchived;
        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.textContent = 'Rename task';
        renameButton.disabled = currentProjectArchived;
        renameButton.addEventListener('click', async () => {
          const newTitle = renameInput.value.trim();
          if (!newTitle) {
            error.textContent = 'Task title is required';
            error.hidden = false;
            return;
          }
          error.hidden = true;
          const updated = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id + '/title', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
          });
          if (!updated.ok) throw new Error('Unable to rename task');
          await renderTasks();
        });
        const priority = document.createElement('select');
        priority.setAttribute('aria-label', 'Task priority');
        for (const value of ['Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          priority.append(option);
        }
        priority.value = task.priority;
        priority.disabled = currentProjectArchived;
        priority.addEventListener('change', async () => {
          const updated = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id + '/priority', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value })
          });
          if (!updated.ok) throw new Error('Unable to update task priority');
          await renderTasks();
        });
        const dueDate = document.createElement('input');
        dueDate.type = 'text';
        dueDate.className = 'due-date';
        dueDate.setAttribute('aria-label', 'Task due date');
        dueDate.placeholder = 'YYYY-MM-DD';
        dueDate.value = task.due_date || '';
        dueDate.disabled = currentProjectArchived;
        const saveDueDate = document.createElement('button');
        saveDueDate.type = 'button';
        saveDueDate.textContent = 'Save due date';
        saveDueDate.disabled = currentProjectArchived;
        saveDueDate.addEventListener('click', async () => {
          const value = dueDate.value.trim();
          const updated = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id + '/due-date', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: value })
          });
          if (updated.status === 400) {
            error.textContent = 'Due date must be a valid YYYY-MM-DD date';
            error.hidden = false;
            return;
          }
          if (!updated.ok) throw new Error('Unable to save due date');
          error.hidden = true;
          const saved = await updated.json();
          dueDate.value = saved.due_date || '';
          await renderTasks();
        });
        const destination = document.createElement('select');
        destination.setAttribute('aria-label', 'Destination project');
        for (const project of eligibleProjects) {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          destination.append(option);
        }
        destination.disabled = currentProjectArchived || eligibleProjects.length === 0;
        const moveButton = document.createElement('button');
        moveButton.type = 'button';
        moveButton.textContent = 'Move task';
        moveButton.disabled = destination.disabled;
        moveButton.addEventListener('click', async () => {
          const moved = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks/' + task.id + '/move', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destination.value) })
          });
          if (!moved.ok) throw new Error('Unable to move task');
          await renderTasks();
        });
        row.append(checkbox, title, renameInput, renameButton, priority, dueDate, saveDueDate, destination, moveButton);
        taskList.append(row);
      }
    }

    document.querySelector('#task-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#task-title');
      const title = input.value.trim();
      if (!title) {
        error.textContent = 'Task title is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error('Unable to create task');
      input.value = '';
      await renderTasks();
    });
    document.querySelector('#rename-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#new-project-name');
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'Project name is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/name', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to rename project');
      document.querySelector('#project-title').textContent = name;
      input.value = '';
    });
    document.querySelector('#task-filter').addEventListener('change', renderTasks);
    document.querySelector('#priority-filter').addEventListener('change', renderTasks);
    document.querySelector('#due-range-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const from = document.querySelector('#due-from').value.trim();
      const through = document.querySelector('#due-through').value.trim();
      if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
        error.textContent = 'Due range must use valid YYYY-MM-DD dates';
        error.hidden = false;
        return;
      }
      if (from && through && from > through) {
        error.textContent = 'Due from must not be after Due through';
        error.hidden = false;
        return;
      }
      appliedDueFrom = from;
      appliedDueThrough = through;
      error.hidden = true;
      await renderTasks();
    });
    document.querySelector('#default-task-priority').addEventListener('change', async (event) => {
      const response = await fetch('/api/projects/' + encodeURIComponent(currentProjectId) + '/default-priority', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: event.target.value })
      });
      if (!response.ok) throw new Error('Unable to update default task priority');
    });
    document.querySelector('#project-filter').addEventListener('change', showList);
    document.querySelector('#project-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      appliedProjectQuery = document.querySelector('#project-search').value.trim();
      error.hidden = true;
      await showList();
    });
    document.querySelector('#task-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      appliedTaskQuery = document.querySelector('#task-search').value.trim();
      error.hidden = true;
      await renderTasks();
    });

    function isValidCalendarDate(value) {
      const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
      if (!match) return false;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year < 1 || month < 1 || month > 12) return false;
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day >= 1 && day <= days[month - 1];
    }

    document.querySelector('#create-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#project-name');
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'Project name is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to create project');
      input.value = '';
      await showList();
    });

    document.querySelector('#back').addEventListener('click', () => { appliedProjectQuery = ''; window.location.href = '/'; });
    const match = window.location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) showProject(match[1]);
    else showList();
  </script>
</body>
</html>`);
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all().map(project => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) sendJson(response, 404, { error: 'Project not found' });
    else sendJson(response, 200, { ...project, archived: Boolean(project.archived) });
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(archiveMatch[1]);
      const body = await readRequestBody(request);
      if (typeof body.archived !== 'boolean') { sendJson(response, 400, { error: 'archived must be a boolean' }); return; }
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      setProjectArchived.run(body.archived ? 1 : 0, projectId);
      sendJson(response, 200, { ...project, archived: body.archived });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (defaultPriorityMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(defaultPriorityMatch[1]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change default task priority' }); return; }
      const body = await readRequestBody(request);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) { sendJson(response, 400, { error: 'Invalid default task priority' }); return; }
      setProjectDefaultPriority.run(body.priority, projectId);
      sendJson(response, 200, { ...project, default_priority: body.priority });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/name$/);
  if (renameMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(renameMatch[1]);
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot be renamed' }); return; }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) sendJson(response, 404, { error: 'Project not found' });
    else sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    return;
  }
  if (tasksMatch && request.method === 'POST') {
    try {
      const projectId = Number(tasksMatch[1]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot have new tasks' }); return; }
      const body = await readRequestBody(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const position = nextRememberedTaskPosition.get(projectId).position;
      const result = createTask.run(projectId, title, project.default_priority, position);
      rememberTaskPosition.run(Number(result.lastInsertRowid), projectId, position);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false, priority: project.default_priority });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  const taskRenameMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/title$/);
  const taskPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/priority$/);
  const taskDueDateMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/due-date$/);
  const taskMoveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (taskMoveMatch && request.method === 'PATCH') {
    try {
      const sourceId = Number(taskMoveMatch[1]);
      const taskId = Number(taskMoveMatch[2]);
      const source = getProject.get(sourceId);
      if (!source) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (source.archived) { sendJson(response, 409, { error: 'Archived projects cannot move tasks' }); return; }
      const body = await readRequestBody(request);
      const destinationId = Number(body.destination_project_id);
      if (!Number.isSafeInteger(destinationId) || destinationId <= 0) { sendJson(response, 400, { error: 'Invalid destination project' }); return; }
      const destination = getProject.get(destinationId);
      if (!destination) { sendJson(response, 404, { error: 'Destination project not found' }); return; }
      if (destination.archived || destinationId === sourceId) { sendJson(response, 409, { error: 'Destination must be a different active project' }); return; }
      const task = getTask.get(taskId, sourceId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      const rememberedPosition = getRememberedTaskPosition.get(taskId, destinationId);
      const position = rememberedPosition?.position ?? nextRememberedTaskPosition.get(destinationId).position;
      if (!rememberedPosition) rememberTaskPosition.run(taskId, destinationId, position);
      moveTask.run(destinationId, position, taskId, sourceId);
      sendJson(response, 200, { ...task, project_id: destinationId });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (taskDueDateMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskDueDateMatch[1]);
      const taskId = Number(taskDueDateMatch[2]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change task due dates' }); return; }
      const body = await readRequestBody(request);
      const dueDate = typeof body.due_date === 'string' ? body.due_date.trim() : '';
      if (dueDate && !isValidDueDate(dueDate)) { sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' }); return; }
      const task = getTask.get(taskId, projectId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      updateTaskDueDate.run(dueDate || null, taskId, projectId);
      sendJson(response, 200, { ...task, due_date: dueDate || null });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (taskPriorityMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskPriorityMatch[1]);
      const taskId = Number(taskPriorityMatch[2]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change task priority' }); return; }
      const body = await readRequestBody(request);
      if (!['Low', 'Normal', 'High'].includes(body.priority)) { sendJson(response, 400, { error: 'Invalid task priority' }); return; }
      const task = getTask.get(taskId, projectId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      updateTaskPriority.run(body.priority, taskId, projectId);
      sendJson(response, 200, { ...task, priority: body.priority });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (taskRenameMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskRenameMatch[1]);
      const taskId = Number(taskRenameMatch[2]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot rename tasks' }); return; }
      const body = await readRequestBody(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
      const task = getTask.get(taskId, projectId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      renameTask.run(title, taskId, projectId);
      sendJson(response, 200, { ...task, title });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (taskMatch && request.method === 'PATCH') {
    try {
      const projectId = Number(taskMatch[1]);
      const taskId = Number(taskMatch[2]);
      const project = getProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change task completion' }); return; }
      const body = await readRequestBody(request);
      if (typeof body.completed !== 'boolean') { sendJson(response, 400, { error: 'completed must be a boolean' }); return; }
      const task = getTask.get(taskId, projectId);
      if (!task) { sendJson(response, 404, { error: 'Task not found' }); return; }
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      sendJson(response, 200, { ...task, completed: body.completed });
    } catch { sendJson(response, 400, { error: 'Invalid request body' }); }
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    sendPage(response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
