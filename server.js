import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
    main { background: white; border: 1px solid #d8dee8; border-radius: 10px; padding: 28px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    input { flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid #9aa7b7; border-radius: 5px; font: inherit; }
    button { padding: 9px 14px; border: 0; border-radius: 5px; color: white; background: #2458a6; font: inherit; cursor: pointer; }
    button:hover { background: #17437f; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid #e1e6ed; }
    .project-name { overflow-wrap: anywhere; }
    [role="alert"] { color: #a11; margin: 0 0 16px; }
  </style>
</head>
<body><main id="app"></main>
<script>
const app = document.querySelector('#app');
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects?filter=all');
    const projects = await response.json();
    const project = projects.find(item => String(item.id) === match[1]);
    app.replaceChildren();
    const back = document.createElement('button'); back.textContent = 'Projects'; back.addEventListener('click', () => { history.pushState({}, '', '/'); render(); });
    app.append(back);
    const heading = document.createElement('h1'); heading.textContent = project ? project.name : 'Project not found'; app.append(heading);
    if (project?.archived) { const archivedNotice = document.createElement('p'); archivedNotice.textContent = 'Archived project'; app.append(archivedNotice); }
    document.title = project ? project.name + ' - Workboard' : 'Workboard';
    if (!project) return;

    const form = document.createElement('form');
    form.innerHTML = '<label for="task-title">Task title</label><input id="task-title" name="title" aria-label="Task title"><button type="submit">Create task</button>';
    if (project.archived) { form.elements.title.disabled = true; form.querySelector('button').disabled = true; }
    const message = document.createElement('div'); message.setAttribute('role', 'alert'); message.setAttribute('aria-live', 'polite');
    const filterLabel = document.createElement('label'); filterLabel.htmlFor = 'task-filter'; filterLabel.textContent = 'Task filter';
    const filter = document.createElement('select'); filter.id = 'task-filter'; filter.setAttribute('aria-label', 'Task filter');
    for (const value of ['All', 'Open', 'Completed']) { const option = document.createElement('option'); option.textContent = value; option.value = value; filter.append(option); }
    const list = document.createElement('section'); list.setAttribute('aria-label', 'Tasks');
    app.append(form, message, filterLabel, filter, list);
    async function loadTasks() {
      const response = await fetch('/api/projects/' + project.id + '/tasks');
      const tasks = await response.json(); list.replaceChildren();
      for (const task of tasks) {
        if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
        const row = document.createElement('div'); row.dataset.testid = 'task-row'; row.className = 'project-row';
        const title = document.createElement('span'); title.textContent = task.title;
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.completed; checkbox.disabled = project.archived; checkbox.setAttribute('aria-label', 'Complete ' + task.title);
        checkbox.addEventListener('change', async () => { await fetch('/api/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) }); await loadTasks(); });
        row.append(title, checkbox); list.append(row);
      }
    }
    filter.addEventListener('change', loadTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const title = form.elements.title.value.trim();
      if (!title) { message.textContent = 'Task title is required'; return; }
      message.textContent = '';
      await fetch('/api/projects/' + project.id + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      form.reset(); await loadTasks();
    });
    await loadTasks();
    return;
  }
  document.title = 'Workboard';
  app.innerHTML = '<h1>Workboard</h1><form><label for="project-name">Project name</label><input id="project-name" name="name" aria-label="Project name"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><section id="projects" aria-label="Projects"></section>';
  const form = app.querySelector('form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const message = app.querySelector('#message');
    if (!name) { message.textContent = 'Project name is required'; return; }
    message.textContent = '';
    await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    render();
  });
  const filterLabel = document.createElement('label'); filterLabel.htmlFor = 'project-filter'; filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select'); filter.id = 'project-filter'; filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) { const option = document.createElement('option'); option.value = value; option.textContent = value; filter.append(option); }
  const projectsSection = app.querySelector('#projects'); projectsSection.before(filterLabel, filter);
  const list = projectsSection;
  async function loadProjects() {
  const response = await fetch('/api/projects?filter=' + filter.value.toLowerCase());
  const projects = await response.json();
  list.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div'); row.className = 'project-row'; row.dataset.testid = 'project-row';
    const name = document.createElement('span'); name.className = 'project-name'; name.textContent = project.name;
    const open = document.createElement('button'); open.textContent = 'Open project'; open.addEventListener('click', () => { history.pushState({}, '', '/projects/' + project.id); render(); });
    const summary = document.createElement('span'); summary.dataset.testid = 'project-summary'; summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
    row.append(name, summary, open);
    const action = document.createElement('button'); action.textContent = project.archived ? 'Restore project' : 'Archive project';
    action.addEventListener('click', async () => { await fetch('/api/projects/' + project.id + '/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) }); await loadProjects(); });
    row.append(action); list.append(row);
  }
  }
  filter.addEventListener('change', loadProjects);
  await loadProjects();
}
addEventListener('popstate', render);
render();
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/health' && req.method === 'GET') return send(200, JSON.stringify({ status: 'ok' }));
  const taskPath = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskPath && req.method === 'GET') {
    return send(200, JSON.stringify(db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskPath[1])).map(task => ({ ...task, completed: Boolean(task.completed) }))));
  }
  if (taskPath && req.method === 'POST') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw); const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) return send(400, JSON.stringify({ error: 'Task title is required' }));
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(taskPath[1]))) return send(404, JSON.stringify({ error: 'Project not found' }));
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(Number(taskPath[1]), title);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), title, completed: false }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const taskUpdate = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskUpdate && req.method === 'PATCH') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      if (typeof input.completed !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid completion state' }));
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(input.completed ? 1 : 0, Number(taskUpdate[1]));
      return result.changes ? send(200, JSON.stringify({ status: 'ok' })) : send(404, JSON.stringify({ error: 'Task not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  const archivePath = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archivePath && req.method === 'POST') {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      if (typeof input.archived !== 'boolean') return send(400, JSON.stringify({ error: 'Invalid archive state' }));
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(input.archived ? 1 : 0, Number(archivePath[1]));
      return result.changes ? send(200, JSON.stringify({ status: 'ok' })) : send(404, JSON.stringify({ error: 'Project not found' }));
    } catch { return send(400, JSON.stringify({ error: 'Invalid request' })); }
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const filter = url.searchParams.get('filter');
    const query = 'SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id';
    const projects = filter === 'all'
      ? db.prepare(query + ' GROUP BY p.id ORDER BY p.id').all()
      : db.prepare(query + ' WHERE p.archived = ? GROUP BY p.id ORDER BY p.id').all(filter === 'archived' ? 1 : 0);
    return send(200, JSON.stringify(projects.map(project => ({ ...project, archived: Boolean(project.archived) }))));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET') return send(200, page, 'text/html; charset=utf-8');
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0');
