import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title><link rel="stylesheet" href="/style.css"></head>
<body><main id="app" aria-live="polite"></main><script type="module" src="/app.js"></script></body></html>`;
const assets = {
  '/': [page, 'text/html; charset=utf-8'],
  '/app.js': [String.raw`const app = document.querySelector('#app');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function projects(filter = 'Active') { const r = await fetch('/api/projects?filter='+filter); return r.json(); }
function renderList(message = '') {
  app.innerHTML = '<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><div class="form-row"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div></form>' + (message ? '<p class="alert" role="alert">'+escapeHtml(message)+'</p>' : '') + '<div class="filter-row"><label for="project-filter">Project filter</label><select id="project-filter"><option>Active</option><option>Archived</option></select></div><section id="projects" aria-label="Projects"></section>';
  const form = document.querySelector('#create');
  form.addEventListener('submit', async e => { e.preventDefault(); const name = new FormData(form).get('name').trim(); if (!name) { renderList('Project name is required'); return; } await fetch('/api/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) }); renderList(); });
  const filter = document.querySelector('#project-filter');
  async function loadProjects() { const items = await projects(filter.value); const list = document.querySelector('#projects'); if (!list) return; list.innerHTML = items.map(p => '<div data-testid="project-row" class="project-row"><span>'+escapeHtml(p.name)+'</span><span data-testid="project-summary">'+p.completedCount+'/'+p.totalCount+' completed</span><button type="button" data-action="open" data-id="'+p.id+'">Open project</button>'+(p.archived ? '<button type="button" data-action="restore" data-id="'+p.id+'">Restore project</button>' : '<button type="button" data-action="archive" data-id="'+p.id+'">Archive project</button>')+'</div>').join(''); list.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => { if (b.dataset.action === 'open') location.href='/projects/'+b.dataset.id; else { await fetch('/api/projects/'+b.dataset.id+'/'+b.dataset.action, {method:'POST'}); loadProjects(); } })); }
  filter.addEventListener('change', loadProjects); loadProjects();
}
async function renderProject(id) {
  const r = await fetch('/api/projects/'+encodeURIComponent(id));
  if (!r.ok) { renderList(); return; }
  const p = await r.json();
  app.innerHTML = '<button type="button" id="back">Projects</button><h1>'+escapeHtml(p.name)+'</h1>'+(p.archived ? '<p>Archived project</p>' : '')+'<form id="create-task"><label for="task-title">Task title</label><div class="form-row"><input id="task-title" name="title" type="text" '+(p.archived ? 'disabled' : '')+'><button type="submit" '+(p.archived ? 'disabled' : '')+'>Create task</button></div></form><p id="task-alert" class="alert" role="alert" hidden></p><div class="filter-row"><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></div><section id="tasks" aria-label="Tasks"></section>';
  document.querySelector('#back').addEventListener('click', () => { location.href='/'; });
  const form = document.querySelector('#create-task');
  form.addEventListener('submit', async e => {
    e.preventDefault(); const title = new FormData(form).get('title').trim();
    const alert = document.querySelector('#task-alert');
    if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
    await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title})});
    form.reset(); alert.hidden = true; loadTasks();
  });
  document.querySelector('#task-filter').addEventListener('change', loadTasks);
  async function loadTasks() {
    const filter = document.querySelector('#task-filter').value;
    const response = await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks?filter='+filter);
    if (!response.ok) return;
    const tasks = await response.json(); const list = document.querySelector('#tasks');
    list.innerHTML = tasks.map(t => '<div data-testid="task-row" class="task-row"><span>'+escapeHtml(t.title)+'</span><label class="check-label"><input type="checkbox" data-id="'+t.id+'" aria-label="Complete '+escapeHtml(t.title)+'" '+(t.completed ? 'checked' : '')+' '+(p.archived ? 'disabled' : '')+'> Completed</label></div>').join('');
    list.querySelectorAll('input[type=checkbox]').forEach(box => box.addEventListener('change', async () => {
      await fetch('/api/tasks/'+encodeURIComponent(box.dataset.id), {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({completed:box.checked})});
      loadTasks();
    }));
  }
  loadTasks();
}
const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]); else renderList();`, 'text/javascript; charset=utf-8'],
  '/style.css': [String.raw`*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:64px auto;padding:32px;background:#fff;border:1px solid #e1e6ef;border-radius:12px;box-shadow:0 8px 28px #1720330b}h1{margin:0 0 28px;font-size:2rem}label{display:block;font-weight:600;margin-bottom:8px}.form-row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #aab4c5;border-radius:6px;padding:10px 12px;font:inherit}button{border:0;border-radius:6px;padding:10px 16px;background:#315bd6;color:white;font:600 15px system-ui;cursor:pointer}button:hover{background:#2348b8}.project-row,.task-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #dce2ec;border-radius:8px;padding:12px 14px;margin-top:12px}.filter-row{display:flex;align-items:center;gap:12px;margin-top:24px}.filter-row label{margin:0}.filter-row select{font:inherit;padding:7px 10px;border:1px solid #aab4c5;border-radius:6px}.check-label{display:flex;align-items:center;gap:8px;margin:0}.check-label input{flex:initial;width:18px;height:18px}.alert{color:#a51e2d;font-weight:600;margin-bottom:0}@media(max-width:600px){main{margin:20px;padding:22px}.form-row{align-items:stretch;flex-direction:column}}`, 'text/css; charset=utf-8']
};

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) throw new Error('Request too large'); }
  return JSON.parse(body || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS totalCount, COALESCE(SUM(t.completed), 0) AS completedCount
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`).all(archived).map(p => ({...p, archived: !!p.archived})));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readJson(req);
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmed);
      return send(res, 201, { id: Number(result.lastInsertRowid), name: trimmed });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    if (project) project.archived = !!project.archived;
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if (req.method === 'POST' && archiveMatch) {
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archiveMatch[2] === 'archive' ? 1 : 0, Number(archiveMatch[1]));
    return result.changes ? send(res, 200, {status:'ok'}) : send(res, 404, {error:'Project not found'});
  }
  const projectTasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (projectTasksMatch) {
    const projectId = Number(projectTasksMatch[1]);
    const owner = db.prepare('SELECT archived FROM projects WHERE id = ?').get(projectId);
    if (!owner) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      const filter = url.searchParams.get('filter');
      const where = filter === 'Open' ? ' AND completed = 0' : filter === 'Completed' ? ' AND completed = 1' : '';
      return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ?' + where + ' ORDER BY id').all(projectId).map(t => ({...t, completed: !!t.completed})));
    }
    if (req.method === 'POST') {
      if (owner.archived) return send(res, 409, {error:'Archived project'});
      try {
        const { title } = await readJson(req); const trimmed = typeof title === 'string' ? title.trim() : '';
        if (!trimmed) return send(res, 400, { error: 'Task title is required' });
        const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, trimmed);
        return send(res, 201, { id: Number(result.lastInsertRowid), projectId, title: trimmed, completed: false });
      } catch { return send(res, 400, { error: 'Invalid request' }); }
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    try {
      const { completed } = await readJson(req);
      if (typeof completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
      const task = db.prepare('SELECT tasks.project_id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(Number(taskMatch[1]));
      if (task?.archived) return send(res, 409, {error:'Archived project'});
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? send(res, 200, { status: 'ok' }) : send(res, 404, { error: 'Task not found' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && assets[url.pathname]) { const [body, type] = assets[url.pathname]; return send(res, 200, body, type); }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) return send(res, 200, page, 'text/html; charset=utf-8');
  return send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
