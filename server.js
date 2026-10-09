import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1) AS completed_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
  FROM projects p WHERE p.archived = ? ORDER BY p.id`);
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const app = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #17212b; background: #f5f7fa; font: 16px/1.5 system-ui, sans-serif; }
    main { width: min(720px, calc(100% - 32px)); margin: 64px auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form, .project-row, .task-row { display: flex; gap: 12px; align-items: center; }
    form { margin-bottom: 24px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #aab5c2; border-radius: 6px; font: inherit; background: white; }
    button { padding: 10px 15px; border: 0; border-radius: 6px; color: white; background: #245fc5; font: inherit; cursor: pointer; }
    button:hover { background: #174b9f; }
    .project-row, .task-row { justify-content: space-between; padding: 14px 16px; margin: 10px 0; border: 1px solid #dce2e9; border-radius: 8px; background: white; }
    select { padding: 8px; font: inherit; }
    .task-check { width: auto; flex: none; }
    .alert { margin: 0 0 16px; color: #a32020; }
    [hidden] { display: none !important; }
  </style>
</head>
<body><main id="app"></main>
<script type="module">
const app = document.querySelector('#app');
const escapePath = (id) => '/projects/' + encodeURIComponent(id);
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (response.ok) {
      const project = await response.json();
      app.replaceChildren();
      const back = document.createElement('button');
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1');
      heading.textContent = project.name;
      const form = document.createElement('form');
      form.innerHTML = '<label for="task-title">Task title</label><input id="task-title" type="text"><button type="submit">Create task</button>';
      if (project.archived) { form.querySelector('input').disabled = true; form.querySelector('button').disabled = true; }
      const alert = document.createElement('p');
      alert.className = 'alert'; alert.setAttribute('role', 'alert'); alert.hidden = true;
      app.append(back, heading);
      if (project.archived) { const archived = document.createElement('p'); archived.textContent = 'Archived project'; app.append(archived); }
      const filterLabel = document.createElement('label'); filterLabel.htmlFor = 'task-filter'; filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select'); filter.id = 'task-filter';
      for (const value of ['All', 'Open', 'Completed']) { const option = document.createElement('option'); option.textContent = value; option.value = value; filter.append(option); }
      const list = document.createElement('section'); list.setAttribute('aria-label', 'Tasks');
      app.append(form, alert, filterLabel, filter, list);
      async function loadTasks() {
        const tasks = await (await fetch('/api/projects/' + match[1] + '/tasks')).json();
        list.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = document.createElement('div'); row.dataset.testid = 'task-row'; row.className = 'task-row';
          const title = document.createElement('span'); title.textContent = task.title;
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'task-check'; checkbox.checked = !!task.completed; checkbox.setAttribute('aria-label', 'Complete ' + task.title); checkbox.disabled = !!project.archived;
          checkbox.addEventListener('change', async () => { await fetch('/api/projects/' + match[1] + '/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) }); await loadTasks(); });
          row.append(title, checkbox); list.append(row);
        }
      }
      filter.addEventListener('change', loadTasks);
      form.addEventListener('submit', async event => { event.preventDefault(); const input = form.querySelector('input'); const title = input.value.trim(); if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; } alert.hidden = true; const response = await fetch('/api/projects/' + match[1] + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); if (response.ok) { input.value = ''; await loadTasks(); } });
      await loadTasks();
      return;
    }
  }
  app.innerHTML = '<h1>Workboard</h1><label for="project-filter">Project filter</label> <select id="project-filter"><option>Active</option><option>Archived</option></select><form><label for="project-name">Project name</label><input id="project-name" name="name" type="text"><button type="submit">Create project</button></form><p class="alert" role="alert" hidden></p><section aria-label="Projects"></section>';
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('section');
  async function load() {
    const archived = app.querySelector('#project-filter').value === 'Archived';
    const projects = await (await fetch('/api/projects?filter=' + (archived ? 'Archived' : 'Active'))).json();
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = escapePath(project.id); });
      const summary = document.createElement('span'); summary.dataset.testid = 'project-summary'; summary.textContent = project.completed_count + '/' + project.total_count + ' completed';
      const archive = document.createElement('button');
      archive.textContent = archived ? 'Restore project' : 'Archive project';
      archive.addEventListener('click', async () => { await fetch('/api/projects/' + project.id + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !archived }) }); await load(); });
      row.append(name, summary, open, archive);
      list.append(row);
    }
  }
  app.querySelector('#project-filter').addEventListener('change', load);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
    alert.hidden = true;
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (response.ok) { input.value = ''; await load(); }
  });
  await load();
}
render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'PATCH') {
    try { const body = await readJson(req); if (typeof body.archived !== 'boolean') return send(res, 400, { error: 'Invalid archive state' }); const id = Number(archiveMatch[1]); if (!getProject.get(id)) return send(res, 404, { error: 'Project not found' }); setArchived.run(body.archived ? 1 : 0, id); return send(res, 200, getProject.get(id)); } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (tasksMatch && req.method === 'GET') {
    if (!getProject.get(Number(tasksMatch[1]))) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, listTasks.all(Number(tasksMatch[1])).map(task => ({ ...task, completed: !!task.completed })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const body = await readJson(req); const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      if (!getProject.get(Number(tasksMatch[1]))) return send(res, 404, { error: 'Project not found' });
      if (getProject.get(Number(tasksMatch[1])).archived) return send(res, 409, { error: 'Project is archived' });
      const result = insertTask.run(Number(tasksMatch[1]), title);
      return send(res, 201, { ...getTask.get(Number(result.lastInsertRowid), Number(tasksMatch[1])), completed: false });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readJson(req);
      if (typeof body.completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
      const projectId = Number(taskMatch[1]), taskId = Number(taskMatch[2]);
      if (!getTask.get(taskId, projectId)) return send(res, 404, { error: 'Task not found' });
      if (getProject.get(projectId).archived) return send(res, 409, { error: 'Project is archived' });
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
      return send(res, 200, { ...getTask.get(taskId, projectId), completed: body.completed });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return send(res, 200, app, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
