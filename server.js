import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; flex: 1; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #aab5c2; border-radius: 6px; font: inherit; background: white; }
    button { padding: 10px 15px; border: 0; border-radius: 6px; background: #155eef; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #004eeb; }
    [role="alert"] { margin: 0 0 16px; color: #b42318; }
    #projects { display: grid; gap: 10px; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid #d0d5dd; border-radius: 8px; background: white; }
    [data-testid="project-row"] button { background: #344054; }
    .detail h1 { margin-bottom: 20px; }
    #tasks { display: grid; gap: 10px; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #d0d5dd; border-radius: 8px; background: white; }
    [data-testid="task-row"] input { width: auto; }
    .task-controls { margin-top: 22px; }
    @media (max-width: 520px) { main { padding: 28px 16px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const escapePath = (id) => '/projects/' + encodeURIComponent(id);
    async function loadProjects(filter = 'Active') {
      const response = await fetch('/api/projects?filter=' + encodeURIComponent(filter));
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    function renderList(projects, selectedFilter = 'Active') {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const filterLabel = document.createElement('label'); filterLabel.textContent = 'Project filter';
      const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Project filter');
      for (const value of ['Active', 'Archived']) { const option = document.createElement('option'); option.value = value; option.textContent = value; filter.append(option); }
      filter.value = selectedFilter; filterLabel.append(filter); app.append(filterLabel);
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text'; input.name = 'projectName'; input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert'); alert.hidden = true;
      const list = document.createElement('section');
      list.id = 'projects';
      function updateRows(items) {
        list.replaceChildren();
        for (const project of items) {
        const row = document.createElement('div');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span'); name.textContent = project.name;
        const summary = document.createElement('span'); summary.dataset.testid = 'project-summary'; summary.textContent = project.completed_count + '/' + project.total_count + ' completed';
        const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = escapePath(project.id); });
        const archive = document.createElement('button'); archive.type = 'button'; archive.textContent = filter.value === 'Active' ? 'Archive project' : 'Restore project';
        archive.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: filter.value === 'Active' }) });
          if (result.ok) updateRows(await loadProjects(filter.value));
        });
          row.append(name, summary, open, archive); list.append(row);
        }
      }
      filter.addEventListener('change', async () => updateRows(await loadProjects(filter.value)));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!response.ok) { alert.textContent = 'Could not create project'; alert.hidden = false; return; }
        location.href = '/';
      });
      app.append(form, alert, list);
      updateRows(projects);
    }
    async function renderDetail(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { app.textContent = 'Project not found'; return; }
      const project = await response.json();
      const section = document.createElement('section'); section.className = 'detail';
      const heading = document.createElement('h1'); heading.textContent = project.name;
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      section.append(heading, back);
      if (project.archived) { const archived = document.createElement('p'); archived.textContent = 'Archived project'; section.append(archived); }
      const renameForm = document.createElement('form'); renameForm.className = 'task-controls';
      const renameLabel = document.createElement('label'); renameLabel.textContent = 'New project name';
      const renameInput = document.createElement('input'); renameInput.type = 'text'; renameInput.setAttribute('aria-label', 'New project name'); renameInput.value = project.name;
      const renameButton = document.createElement('button'); renameButton.type = 'submit'; renameButton.textContent = 'Rename project';
      if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
      renameLabel.append(renameInput); renameForm.append(renameLabel, renameButton);
      const renameAlert = document.createElement('p'); renameAlert.setAttribute('role', 'alert'); renameAlert.hidden = true;
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault(); const name = renameInput.value.trim();
        if (!name) { renameAlert.textContent = 'Project name is required'; renameAlert.hidden = false; renameInput.focus(); return; }
        const result = await fetch('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!result.ok) { renameAlert.textContent = 'Could not rename project'; renameAlert.hidden = false; return; }
        project.name = name; heading.textContent = name; renameInput.value = name; renameAlert.hidden = true;
      });
      const form = document.createElement('form'); form.className = 'task-controls';
      const label = document.createElement('label'); label.textContent = 'Task title';
      const input = document.createElement('input'); input.type = 'text'; input.setAttribute('aria-label', 'Task title'); label.append(input);
      const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Create task'; form.append(label, submit);
      if (project.archived) { submit.disabled = true; input.disabled = true; }
      const alert = document.createElement('p'); alert.setAttribute('role', 'alert'); alert.hidden = true;
      const filterLabel = document.createElement('label'); filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Task filter');
      for (const value of ['All', 'Open', 'Completed']) { const option = document.createElement('option'); option.textContent = value; option.value = value; filter.append(option); }
      filterLabel.append(filter);
      const list = document.createElement('section'); list.id = 'tasks';
      async function refreshTasks() {
        const result = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks');
        if (!result.ok) throw new Error('Could not load tasks');
        const tasks = await result.json(); list.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = document.createElement('div'); row.dataset.testid = 'task-row';
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.completed;
          checkbox.disabled = project.archived;
          checkbox.setAttribute('aria-label', 'Complete ' + task.title);
          checkbox.addEventListener('change', async () => {
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
            if (!update.ok) { checkbox.checked = !checkbox.checked; return; }
            await refreshTasks();
          });
          const title = document.createElement('span'); title.textContent = task.title; row.append(checkbox, title); list.append(row);
        }
      }
      filter.addEventListener('change', () => refreshTasks().catch(() => { list.textContent = 'Could not load tasks'; }));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); const title = input.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
        const created = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
        if (!created.ok) { alert.textContent = 'Could not create task'; alert.hidden = false; return; }
        alert.hidden = true; input.value = ''; await refreshTasks();
      });
      section.append(renameForm, renameAlert, form, alert, filterLabel, list); app.replaceChildren(section); await refreshTasks();
    }
    const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) renderDetail(match[1]).catch(() => { app.textContent = 'Could not load project'; });
    else loadProjects().then(renderList).catch(() => { app.textContent = 'Could not load projects'; });
  </script>
</body>
</html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    return sendJson(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`).all(archived).map(p => ({...p, id: String(p.id), archived: Boolean(p.archived)})));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: String(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, projectMatch[1]);
      if (!result.changes) {
        const exists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectMatch[1]);
        return exists ? sendJson(res, 409, { error: 'Archived projects cannot be renamed' }) : sendJson(res, 404, { error: 'Project not found' });
      }
      return sendJson(res, 200, { status: 'ok', name });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(projectMatch[1]);
    return project ? sendJson(res, 200, {...project, id: String(project.id), archived: Boolean(project.archived)}) : sendJson(res, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (typeof body.archived !== 'boolean') return sendJson(res, 400, { error: 'Invalid archive state' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, archiveMatch[1]);
      return result.changes ? sendJson(res, 200, { status: 'ok' }) : sendJson(res, 404, { error: 'Project not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(tasksMatch[1])) return sendJson(res, 404, { error: 'Project not found' });
    const tasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(tasksMatch[1]);
    return sendJson(res, 200, tasks.map((task) => ({ ...task, id: String(task.id), completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const owner = db.prepare('SELECT archived FROM projects WHERE id = ?').get(tasksMatch[1]);
      if (!owner) return sendJson(res, 404, { error: 'Project not found' });
      if (owner.archived) return sendJson(res, 409, { error: 'Archived projects cannot accept tasks' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(tasksMatch[1], title);
      return sendJson(res, 201, { id: String(result.lastInsertRowid), title, completed: false });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readJson(req);
      if (typeof body.completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, taskMatch[1]);
      return result.changes ? sendJson(res, 200, { status: 'ok' }) : sendJson(res, 404, { error: 'Task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
