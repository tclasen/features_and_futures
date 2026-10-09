import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
// Keep databases created by earlier pilot tasks compatible.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name);
if (!projectColumns.includes('archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17233b; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(720px, calc(100% - 32px)); margin: 56px auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; gap: 10px; margin-bottom: 20px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #aeb9ca; border-radius: 6px; font: inherit; }
    button { padding: 10px 14px; border: 0; border-radius: 6px; background: #2458c6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1947a8; }
    .project-list { display: grid; gap: 10px; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: white; border: 1px solid #dce2ec; border-radius: 8px; }
    [role="alert"] { margin: 0 0 14px; color: #a21c28; }
    .empty { color: #59677e; }
    .back { margin: 0 0 24px; }
    .row-actions { display: flex; align-items: center; gap: 10px; }
    .summary { color: #59677e; white-space: nowrap; }
    button.secondary { background: #53627b; }
    button:disabled, input:disabled { opacity: .55; cursor: not-allowed; }
    @media (max-width: 520px) { form { flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const root = document.querySelector('#app');
    const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function request(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }
    function projectIdFromPath() {
      const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
      return match ? match[1] : null;
    }
    async function showList(message = '') {
      root.innerHTML = '<h1>Workboard</h1><form id="create-form"><label for="project-name" style="position:absolute;left:-10000px">Project name</label><input id="project-name" name="name" aria-label="Project name" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert"></div><label for="project-filter">Project filter</label> <select id="project-filter" aria-label="Project filter"><option>Active</option><option>Archived</option></select><div class="project-list" id="projects"></div>';
      if (message) root.querySelector('#message').textContent = message;
      const list = root.querySelector('#projects');
      const renderProjects = async () => {
      const filter = root.querySelector('#project-filter').value;
      const projects = await request('/api/projects?filter=' + filter.toLowerCase());
      list.replaceChildren();
      if (!projects.length) list.innerHTML = '<p class="empty">No projects yet.</p>';
      for (const project of projects) {
        const row = document.createElement('div');
        row.dataset.testid = 'project-row';
        row.innerHTML = '<span>' + esc(project.name) + '</span><span class="row-actions"><span class="summary" data-testid="project-summary">' + project.completed_count + '/' + project.total_count + ' completed</span><button type="button">Open project</button>' + (project.archived ? '<button type="button" class="secondary">Restore project</button>' : '<button type="button" class="secondary">Archive project</button>') + '</span>';
        row.querySelector('button').addEventListener('click', () => navigate('/projects/' + project.id));
        const archiveButton = row.querySelectorAll('button')[1];
        archiveButton.addEventListener('click', async () => { await request('/api/projects/' + project.id + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) }); renderProjects(); });
        list.append(row);
      }
      };
      root.querySelector('#project-filter').addEventListener('change', renderProjects);
      renderProjects();
      root.querySelector('#create-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = root.querySelector('#project-name').value.trim();
        if (!name) { root.querySelector('#message').textContent = 'Project name is required'; return; }
        await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        showList();
      });
    }
    async function showProject(id) {
      let project;
      try { project = await request('/api/projects/' + encodeURIComponent(id)); }
      catch { navigate('/'); return; }
      root.innerHTML = '<button class="back" type="button">Projects</button>' + (project.archived ? '<p>Archived project</p>' : '') + '<h1>' + esc(project.name) + '</h1><form id="task-form"><label for="task-title" style="position:absolute;left:-10000px">Task title</label><input id="task-title" name="title" aria-label="Task title" autocomplete="off"' + (project.archived ? ' disabled' : '') + '><button type="submit"' + (project.archived ? ' disabled' : '') + '>Create task</button></form><div id="task-message" role="alert"></div><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><div class="project-list" id="tasks"></div>';
      root.querySelector('.back').addEventListener('click', () => navigate('/'));
      const renderTasks = async () => {
        const filter = root.querySelector('#task-filter').value;
        const tasks = await request('/api/projects/' + encodeURIComponent(id) + '/tasks');
        const visible = tasks.filter(task => filter === 'All' || (filter === 'Open' ? !task.completed : !!task.completed));
        const list = root.querySelector('#tasks');
        list.replaceChildren();
        if (!visible.length) { list.innerHTML = '<p class="empty">No tasks yet.</p>'; return; }
        for (const task of visible) {
          const row = document.createElement('div');
          row.dataset.testid = 'task-row';
          row.innerHTML = '<span>' + esc(task.title) + '</span><input type="checkbox" aria-label="Complete ' + esc(task.title) + '"' + (task.completed ? ' checked' : '') + (project.archived ? ' disabled' : '') + '>';
          row.querySelector('input').addEventListener('change', async (event) => {
            await request('/api/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: event.target.checked }) });
            renderTasks();
          });
          list.append(row);
        }
      };
      root.querySelector('#task-filter').addEventListener('change', renderTasks);
      root.querySelector('#task-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = root.querySelector('#task-title').value.trim();
        if (!title) { root.querySelector('#task-message').textContent = 'Task title is required'; return; }
        await request('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
        root.querySelector('#task-title').value = '';
        root.querySelector('#task-message').textContent = '';
        renderTasks();
      });
      renderTasks();
    }
    function render() {
      const id = projectIdFromPath();
      if (id) showProject(id); else showList();
    }
    function navigate(path) { history.pushState({}, '', path); render(); }
    addEventListener('popstate', render);
    render();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const filter = url.searchParams.get('filter') === 'archived' ? 1 : 0;
    sendJson(response, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id ASC`).all(filter).map(p => ({ ...p, archived: !!p.archived })));
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.archived !== 'boolean') { sendJson(response, 400, { error: 'Archive state is required' }); return; }
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, archiveMatch[1]);
    if (!result.changes) { sendJson(response, 404, { error: 'Project not found' }); return; }
    sendJson(response, 200, { status: 'ok' }); return;
  }
  if (tasksMatch && request.method === 'GET') {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(tasksMatch[1]);
    if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
    sendJson(response, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC').all(tasksMatch[1]).map(task => ({ ...task, completed: !!task.completed })));
    return;
  }
  if (tasksMatch && request.method === 'POST') {
    const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(tasksMatch[1]);
    if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
    if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot accept tasks' }); return; }
    const body = await readBody(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) { sendJson(response, 400, { error: 'Task title is required' }); return; }
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(tasksMatch[1], title);
    sendJson(response, 201, { id: Number(result.lastInsertRowid), title, completed: false });
    return;
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    if (typeof body?.completed !== 'boolean') { sendJson(response, 400, { error: 'Completion state is required' }); return; }
    const result = db.prepare(`UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived = 0)`).run(body.completed ? 1 : 0, taskMatch[1]);
    if (!result.changes) { sendJson(response, 404, { error: 'Task not found' }); return; }
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(projectMatch[1]);
    if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
    sendJson(response, 200, { ...project, archived: !!project.archived });
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
