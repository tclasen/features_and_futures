import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
  )
`);
// Upgrade databases created by the earlier task checkpoints.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}

const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount,
  COUNT(t.id) AS totalCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; padding: 3rem 1rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #d9e0e8; border-radius: 12px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; align-items: end; flex-wrap: wrap; }
    label { display: grid; gap: .35rem; font-weight: 600; }
    input, button { font: inherit; padding: .65rem .8rem; border: 1px solid #aeb9c6; border-radius: 6px; }
    button { cursor: pointer; background: #174ea6; color: white; border-color: #174ea6; }
    button.secondary { background: white; color: #174ea6; }
    ul { padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .7rem; padding: .7rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] input { padding: 0; }
    .task-controls { margin-top: 1.5rem; }
    [role="alert"] { color: #a32626; margin: .75rem 0; }
  </style>
</head>
<body>
  <main id="app"><p>Loading…</p></main>
  <script>
    const app = document.querySelector('#app');
    const escId = (value) => encodeURIComponent(value);
    async function getProjects(archived = false) {
      const response = await fetch('/api/projects?archived=' + (archived ? '1' : '0'));
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    async function showList(selectedFilter = 'Active') {
      const archived = selectedFilter === 'Archived';
      const projects = await getProjects(archived);
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (!response.ok) return;
        await showList();
      });
      app.append(form, alert);
      const filterLabel = document.createElement('label');
      filterLabel.textContent = 'Project filter';
      const filter = document.createElement('select');
      filter.setAttribute('aria-label', 'Project filter');
      for (const value of ['Active', 'Archived']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        filter.append(option);
      }
      filter.value = selectedFilter;
      filter.addEventListener('change', () => showList(filter.value));
      filterLabel.append(filter);
      app.append(filterLabel);
      const list = document.createElement('ul');
      for (const project of projects) {
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const summary = document.createElement('span');
        summary.dataset.testid = 'project-summary';
        summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + escId(project.id); });
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.className = 'secondary';
        archive.textContent = archived ? 'Restore project' : 'Archive project';
        archive.addEventListener('click', async () => {
          const changed = await fetch('/api/projects/' + escId(project.id) + '/archive', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !archived })
          });
          if (changed.ok) await showList(selectedFilter);
        });
        row.append(name, summary, open, archive);
        list.append(row);
      }
      app.append(list);
    }
    async function showProject(id) {
      const response = await fetch('/api/projects/' + escId(id));
      app.replaceChildren();
      if (!response.ok) {
        const heading = document.createElement('h1');
        heading.textContent = 'Project not found';
        app.append(heading);
      } else {
        const project = await response.json();
        const heading = document.createElement('h1');
        heading.textContent = project.name;
        const back = document.createElement('button');
        back.textContent = 'Projects';
        back.addEventListener('click', () => { location.href = '/'; });
        app.append(heading, back);
        const renameForm = document.createElement('form');
        const renameLabel = document.createElement('label');
        renameLabel.textContent = 'New project name';
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.setAttribute('aria-label', 'New project name');
        renameInput.disabled = Boolean(project.archived);
        renameLabel.append(renameInput);
        const renameButton = document.createElement('button');
        renameButton.type = 'submit';
        renameButton.textContent = 'Rename project';
        renameButton.disabled = Boolean(project.archived);
        renameForm.append(renameLabel, renameButton);
        const renameAlert = document.createElement('p');
        renameAlert.setAttribute('role', 'alert');
        renameAlert.hidden = true;
        renameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const name = renameInput.value.trim();
          if (!name) {
            renameAlert.textContent = 'Project name is required';
            renameAlert.hidden = false;
            renameInput.focus();
            return;
          }
          const renamed = await fetch('/api/projects/' + escId(id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
          });
          if (renamed.ok) await showProject(id);
        });
        app.append(renameForm, renameAlert);
        const archivedNotice = document.createElement('p');
        if (project.archived) {
          archivedNotice.textContent = 'Archived project';
          app.append(archivedNotice);
        }
        const form = document.createElement('form');
        form.className = 'task-controls';
        const label = document.createElement('label');
        label.textContent = 'Task title';
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('aria-label', 'Task title');
        label.append(input);
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Create task';
        submit.disabled = Boolean(project.archived);
        form.append(label, submit);
        const alert = document.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.hidden = true;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const title = input.value.trim();
          if (!title) {
            alert.textContent = 'Task title is required';
            alert.hidden = false;
            input.focus();
            return;
          }
          const created = await fetch('/api/projects/' + escId(id) + '/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (created.ok) await showProject(id);
        });
        app.append(form, alert);
        const filterLabel = document.createElement('label');
        filterLabel.textContent = 'Task filter';
        const filter = document.createElement('select');
        filter.setAttribute('aria-label', 'Task filter');
        for (const value of ['All', 'Open', 'Completed']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          filter.append(option);
        }
        filterLabel.append(filter);
        app.append(filterLabel);
        const priorityFilterLabel = document.createElement('label');
        priorityFilterLabel.textContent = 'Priority filter';
        const priorityFilter = document.createElement('select');
        priorityFilter.setAttribute('aria-label', 'Priority filter');
        for (const value of ['All', 'Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          priorityFilter.append(option);
        }
        priorityFilterLabel.append(priorityFilter);
        app.append(priorityFilterLabel);
        const tasksResponse = await fetch('/api/projects/' + escId(id) + '/tasks');
        const tasks = await tasksResponse.json();
        const list = document.createElement('ul');
        function renderTasks() {
          list.replaceChildren();
          for (const task of tasks) {
            if (filter.value === 'Open' && task.completed) continue;
            if (filter.value === 'Completed' && !task.completed) continue;
            if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
            const row = document.createElement('li');
            row.dataset.testid = 'task-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(task.completed);
            checkbox.disabled = Boolean(project.archived);
            checkbox.setAttribute('aria-label', 'Complete ' + task.title);
            checkbox.addEventListener('change', async () => {
              const updated = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
              });
              if (updated.ok) {
                task.completed = checkbox.checked ? 1 : 0;
                renderTasks();
              }
            });
            const title = document.createElement('span');
            title.textContent = task.title;
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
              const updated = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value })
              });
              if (updated.ok) {
                task.priority = priority.value;
                renderTasks();
              }
            });
            const renameInput = document.createElement('input');
            renameInput.type = 'text';
            renameInput.setAttribute('aria-label', 'New task title');
            renameInput.disabled = Boolean(project.archived);
            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.textContent = 'Rename task';
            renameButton.disabled = Boolean(project.archived);
            renameButton.addEventListener('click', async () => {
              const newTitle = renameInput.value.trim();
              if (!newTitle) {
                alert.textContent = 'Task title is required';
                alert.hidden = false;
                renameInput.focus();
                return;
              }
              const renamed = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
              });
              if (renamed.ok) {
                const updatedTask = await renamed.json();
                task.title = updatedTask.title;
                renderTasks();
              }
            });
            row.append(checkbox, title, renameInput, renameButton, priority);
            list.append(row);
          }
        }
        filter.addEventListener('change', renderTasks);
        priorityFilter.addEventListener('change', renderTasks);
        renderTasks();
        app.append(list);
      }
    }
    const match = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);
    (match ? showProject(decodeURIComponent(match[1])) : showList()).catch(() => {
      app.textContent = 'Unable to load Workboard';
    });
  </script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, listProjects.all(url.searchParams.get('archived') === '1' ? 1 : 0));
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = createProject.run(name);
    return sendJson(response, 201, findProject.get(result.lastInsertRowid));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'archived must be a boolean' });
    setProjectArchived.run(body.archived ? 1 : 0, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollectionMatch) {
    const projectId = Number(taskCollectionMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      if (findProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived projects cannot accept tasks' });
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = createTask.run(projectId, title);
      return sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const body = await readJson(request);
    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      renameTask.run(title, taskId, projectId);
    } else if (typeof body?.completed === 'boolean') {
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    } else if (['Low', 'Normal', 'High'].includes(body?.priority)) {
      updateTaskPriority.run(body.priority, taskId, projectId);
    } else {
      return sendJson(response, 400, { error: 'A task title, completion state, or valid priority is required' });
    }
    const task = findTask.get(taskId, projectId);
    return task ? sendJson(response, 200, task) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
