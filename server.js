import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
db.exec('PRAGMA foreign_keys = ON');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS totalCount
  FROM projects p WHERE p.archived = ? ORDER BY p.id ASC`);
const findProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY id ASC');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; padding: 3rem 1.25rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #dce2ec; border-radius: 12px; box-shadow: 0 8px 24px #1720330b; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: .4rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: .65rem .75rem; border: 1px solid #9aa6b8; border-radius: 6px; font: inherit; }
    .field { flex: 1; }
    button { padding: .65rem 1rem; border: 0; border-radius: 6px; color: white; background: #2457c5; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1946a7; }
    button:focus-visible, input:focus-visible { outline: 3px solid #80aaff; outline-offset: 2px; }
    #error { color: #a11b1b; margin: 0 0 1rem; }
    #projects { list-style: none; margin: 0; padding: 0; }
    .task-controls { display: flex; gap: .75rem; margin: 1.5rem 0; }
    .task-controls .field { flex: 1; }
    select { box-sizing: border-box; padding: .65rem .75rem; border: 1px solid #9aa6b8; border-radius: 6px; font: inherit; background: white; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .75rem; padding: .8rem 0; border-top: 1px solid #e5e9f0; }
    [data-testid="task-row"] label { margin: 0; font-weight: 400; }
    [data-testid="task-row"] input { width: auto; }
    [data-testid="task-row"] input[type="text"] { flex: 1; min-width: 5rem; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 0; border-top: 1px solid #e5e9f0; }
    .project-name { overflow-wrap: anywhere; }
    @media (max-width: 480px) { body { padding: 1rem .75rem; } main { padding: 1.25rem; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const app = document.querySelector('#app');
    const escPath = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);

    async function request(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }

    function renderList(projects, selectedFilter = 'Active') {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      const form = document.createElement('form');
      form.noValidate = true;
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = 'project-name';
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.id = 'project-name';
      input.name = 'projectName';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = document.createElement('button');
      create.type = 'submit';
      create.textContent = 'Create project';
      form.append(field, create);
      const error = document.createElement('p');
      error.id = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const projectFilterLabel = document.createElement('label');
      projectFilterLabel.htmlFor = 'project-filter';
      projectFilterLabel.textContent = 'Project filter';
      const projectFilter = document.createElement('select');
      projectFilter.id = 'project-filter';
      for (const value of ['Active', 'Archived']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        projectFilter.append(option);
      }
      projectFilter.value = selectedFilter;
      const list = document.createElement('ul');
      list.id = 'projects';
      function drawProjects(items) {
        list.replaceChildren();
        for (const project of items) {
          const row = document.createElement('li');
          row.dataset.testid = 'project-row';
          const name = document.createElement('span');
          name.className = 'project-name';
          name.textContent = project.name;
          const open = document.createElement('button');
          open.type = 'button';
          open.textContent = 'Open project';
          open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
          const summary = document.createElement('span');
          summary.dataset.testid = 'project-summary';
          summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
          const actions = document.createElement('div');
          actions.append(open);
          const archive = document.createElement('button');
          archive.type = 'button';
          archive.textContent = project.archived ? 'Restore project' : 'Archive project';
          archive.addEventListener('click', async () => {
            await request('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
            const updated = await request('/api/projects?filter=' + projectFilter.value.toLowerCase());
            drawProjects(updated);
          });
          actions.append(archive);
          row.append(name, summary, actions);
          list.append(row);
        }
      }
      drawProjects(projects);
      projectFilter.addEventListener('change', async () => {
        const selected = projectFilter.value;
        drawProjects(await request('/api/projects?filter=' + selected.toLowerCase()));
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          error.textContent = 'Project name is required';
          error.hidden = false;
          input.focus();
          return;
        }
        error.hidden = true;
        try {
          await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          const updated = await request('/api/projects?filter=' + projectFilter.value.toLowerCase());
          input.value = '';
          drawProjects(updated);
        } catch {
          error.textContent = 'Unable to create project';
          error.hidden = false;
        }
      });
      app.append(heading, form, error, projectFilterLabel, projectFilter, list);
    }

    async function renderProject(id) {
      const project = await request('/api/projects/' + encodeURIComponent(id));
      app.replaceChildren();
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1');
      heading.textContent = project.name;
      const renameForm = document.createElement('form');
      renameForm.noValidate = true;
      const renameField = document.createElement('div');
      renameField.className = 'field';
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = 'new-project-name';
      renameLabel.textContent = 'New project name';
      const renameInput = document.createElement('input');
      renameInput.id = 'new-project-name';
      renameInput.type = 'text';
      renameInput.value = project.name;
      renameInput.disabled = Boolean(project.archived);
      renameField.append(renameLabel, renameInput);
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename project';
      renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameField, renameButton);
      const archived = document.createElement('p');
      archived.textContent = 'Archived project';
      archived.hidden = !project.archived;
      const defaultPriorityLabel = document.createElement('label');
      defaultPriorityLabel.htmlFor = 'default-task-priority';
      defaultPriorityLabel.textContent = 'Default task priority';
      const defaultPriority = document.createElement('select');
      defaultPriority.id = 'default-task-priority';
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        defaultPriority.append(option);
      }
      defaultPriority.value = project.defaultPriority || 'Normal';
      defaultPriority.disabled = Boolean(project.archived);
      defaultPriority.addEventListener('change', async () => {
        try {
          const updated = await request('/api/projects/' + encodeURIComponent(id) + '/default-priority', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: defaultPriority.value }) });
          project.defaultPriority = updated.defaultPriority;
        } catch { defaultPriority.value = project.defaultPriority || 'Normal'; }
      });
      const form = document.createElement('form');
      form.className = 'task-controls';
      form.noValidate = true;
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = 'task-title';
      label.textContent = 'Task title';
      const input = document.createElement('input');
      input.id = 'task-title';
      input.type = 'text';
      field.append(label, input);
      const create = document.createElement('button');
      create.type = 'submit';
      create.textContent = 'Create task';
      create.disabled = Boolean(project.archived);
      form.append(field, create);
      const error = document.createElement('p');
      error.id = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        const name = renameInput.value.trim();
        if (!name) {
          error.textContent = 'Project name is required';
          error.hidden = false;
          renameInput.focus();
          return;
        }
        try {
          const updated = await request('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          project.name = updated.name;
          heading.textContent = updated.name;
          error.hidden = true;
        } catch {
          error.textContent = 'Unable to rename project';
          error.hidden = false;
        }
      });
      const filterLabel = document.createElement('label');
      filterLabel.htmlFor = 'task-filter';
      filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select');
      filter.id = 'task-filter';
      for (const value of ['All', 'Open', 'Completed']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        filter.append(option);
      }
      const priorityFilterLabel = document.createElement('label');
      priorityFilterLabel.htmlFor = 'priority-filter';
      priorityFilterLabel.textContent = 'Priority filter';
      const priorityFilter = document.createElement('select');
      priorityFilter.id = 'priority-filter';
      for (const value of ['All', 'Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priorityFilter.append(option);
      }
      const tasksList = document.createElement('ul');
      tasksList.id = 'tasks';
      tasksList.style.listStyle = 'none';
      tasksList.style.margin = '0';
      tasksList.style.padding = '0';
      let tasks = await request('/api/projects/' + encodeURIComponent(id) + '/tasks');
      function drawTasks() {
        tasksList.replaceChildren();
        const visible = tasks.filter(task =>
          (filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed)) &&
          (priorityFilter.value === 'All' || task.priority === priorityFilter.value)
        );
        for (const task of visible) {
          const row = document.createElement('li');
          row.dataset.testid = 'task-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(task.completed);
          checkbox.disabled = Boolean(project.archived);
          checkbox.id = 'task-' + task.id;
          checkbox.setAttribute('aria-label', 'Complete ' + task.title);
          checkbox.addEventListener('change', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              drawTasks();
            } catch { checkbox.checked = !checkbox.checked; }
          });
          const title = document.createElement('label');
          title.htmlFor = checkbox.id;
          title.textContent = task.title;
          const renameInput = document.createElement('input');
          renameInput.type = 'text';
          renameInput.value = task.title;
          renameInput.setAttribute('aria-label', 'New task title');
          renameInput.disabled = Boolean(project.archived);
          const renameButton = document.createElement('button');
          renameButton.type = 'button';
          renameButton.textContent = 'Rename task';
          renameButton.disabled = Boolean(project.archived);
          renameButton.addEventListener('click', async () => {
            const newTitle = renameInput.value.trim();
            if (!newTitle) {
              error.textContent = 'Task title is required';
              error.hidden = false;
              renameInput.focus();
              return;
            }
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              error.hidden = true;
              drawTasks();
            } catch {
              error.textContent = 'Unable to rename task';
              error.hidden = false;
            }
          });
          const priority = document.createElement('select');
          priority.setAttribute('aria-label', 'Task priority');
          for (const value of ['Low', 'Normal', 'High']) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            priority.append(option);
          }
          priority.value = task.priority || 'Normal';
          priority.disabled = Boolean(project.archived);
          priority.addEventListener('change', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              drawTasks();
            } catch { priority.value = task.priority || 'Normal'; }
          });
          const dueDate = document.createElement('input');
          dueDate.type = 'text';
          dueDate.setAttribute('aria-label', 'Task due date');
          dueDate.placeholder = 'YYYY-MM-DD';
          dueDate.value = task.dueDate || '';
          dueDate.disabled = Boolean(project.archived);
          const saveDueDate = document.createElement('button');
          saveDueDate.type = 'button';
          saveDueDate.textContent = 'Save due date';
          saveDueDate.disabled = Boolean(project.archived);
          saveDueDate.addEventListener('click', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate: dueDate.value }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              dueDate.value = updated.dueDate || '';
              error.hidden = true;
            } catch (failure) {
              if (dueDate.value.trim()) {
                error.textContent = 'Due date must be a valid YYYY-MM-DD date';
              } else {
                error.textContent = 'Unable to save due date';
              }
              error.hidden = false;
            }
          });
          row.append(checkbox, title, renameInput, renameButton, priority, dueDate, saveDueDate);
          tasksList.append(row);
        }
      }
      filter.addEventListener('change', drawTasks);
      priorityFilter.addEventListener('change', drawTasks);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) {
          error.textContent = 'Task title is required';
          error.hidden = false;
          input.focus();
          return;
        }
        error.hidden = true;
        try {
          const created = await request('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
          tasks.push(created);
          input.value = '';
          drawTasks();
        } catch {
          error.textContent = 'Unable to create task';
          error.hidden = false;
        }
      });
      drawTasks();
      app.append(back, heading, archived, renameForm, defaultPriorityLabel, defaultPriority, form, error, filterLabel, filter, priorityFilterLabel, priorityFilter, tasksList);
    }

    if (escPath) {
      renderProject(escPath[1]).catch(() => { location.replace('/'); });
    } else {
      request('/api/projects').then(renderList).catch(() => {
        app.textContent = 'Unable to load projects';
      });
    }
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const filter = url.searchParams.get('filter') === 'archived' ? 1 : 0;
    sendJson(response, 200, listProjects.all(filter).map(project => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project ? { ...project, archived: Boolean(project.archived) } : { error: 'Project not found' });
    return;
  }
  if (request.method === 'PATCH' && projectMatch) {
    try {
      const projectId = Number(projectMatch[1]);
      const data = await readBody(request);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        return;
      }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    try {
      const projectId = Number(defaultPriorityMatch[1]);
      const data = await readBody(request);
      if (!['Low', 'Normal', 'High'].includes(data.priority)) {
        sendJson(response, 400, { error: 'Invalid default task priority' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change default task priority' }); return; }
      updateDefaultPriority.run(data.priority, projectId);
      sendJson(response, 200, { ...project, defaultPriority: data.priority, archived: false });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const projectId = Number(archiveMatch[1]);
      const data = await readBody(request);
      if (typeof data.archived !== 'boolean') {
        sendJson(response, 400, { error: 'Archive state is required' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      setArchived.run(data.archived ? 1 : 0, projectId);
      sendJson(response, 200, { ...project, archived: data.archived });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET' && !tasksMatch[2]) {
      sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
      return;
    }
    if (request.method === 'POST' && !tasksMatch[2]) {
      try {
        const data = await readBody(request);
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const project = findProject.get(projectId);
        if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot create tasks' }); return; }
        const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, project.defaultPriority || 'Normal');
        sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultPriority || 'Normal', dueDate: null });
      } catch { sendJson(response, 400, { error: 'Invalid request' }); }
      return;
    }
    if (request.method === 'PATCH' && tasksMatch[2]) {
      try {
        const data = await readBody(request);
        const taskId = Number(tasksMatch[2]);
        const project = findProject.get(projectId);
        if (Object.hasOwn(data, 'dueDate')) {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change task due dates' });
            return;
          }
          const rawDate = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
          let canonicalDate = null;
          if (rawDate) {
            const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
              const year = Number(match[1]);
              const month = Number(match[2]);
              const day = Number(match[3]);
              const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
              const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
              if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]) canonicalDate = rawDate;
            }
            if (!canonicalDate) {
              sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
              return;
            }
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) { sendJson(response, 404, { error: 'Task not found' }); return; }
          updateDueDate.run(canonicalDate, taskId, projectId);
          sendJson(response, 200, { ...existing, dueDate: canonicalDate, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.title === 'string') {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot rename tasks' });
            return;
          }
          const title = data.title.trim();
          if (!title) {
            sendJson(response, 400, { error: 'Task title is required' });
            return;
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) {
            sendJson(response, 404, { error: 'Task not found' });
            return;
          }
          renameTask.run(title, taskId, projectId);
          sendJson(response, 200, { ...existing, title, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.priority === 'string') {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change task priority' });
            return;
          }
          if (!['Low', 'Normal', 'High'].includes(data.priority)) {
            sendJson(response, 400, { error: 'Invalid task priority' });
            return;
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) {
            sendJson(response, 404, { error: 'Task not found' });
            return;
          }
          updatePriority.run(data.priority, taskId, projectId);
          sendJson(response, 200, { ...existing, priority: data.priority, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.completed !== 'boolean') {
          sendJson(response, 400, { error: 'Completion state is required' });
          return;
        }
        updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        const task = findTask.get(taskId, projectId);
        if (!task) sendJson(response, 404, { error: 'Task not found' });
        else sendJson(response, 200, { ...task, completed: Boolean(task.completed) });
      } catch { sendJson(response, 400, { error: 'Invalid request' }); }
      return;
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error('Request too large');
      }
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = addProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request too large');
  }
  return JSON.parse(body);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});
