import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE id = ?');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
  COALESCE(SUM(t.completed), 0) AS completedCount FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
:root{font-family:system-ui,sans-serif;color:#202938;background:#f4f6fa}body{margin:0;padding:2rem 1rem}.app{max-width:720px;margin:0 auto}h1{font-size:2rem;margin:0 0 1.5rem}form,.project-row{background:#fff;border:1px solid #dce2eb;border-radius:8px;padding:1rem;margin-bottom:1rem}label{display:block;font-weight:600;margin-bottom:.5rem}input{box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #9ba7b7;border-radius:5px;font:inherit;margin-bottom:.8rem}button{background:#2458c6;color:white;border:0;border-radius:5px;padding:.65rem 1rem;font:inherit;cursor:pointer}button:focus,input:focus{outline:3px solid #8eb5ff;outline-offset:2px}.project-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}.alert{color:#a31d2d;font-weight:600;margin:.5rem 0 1rem}[hidden]{display:none!important}
</style></head><body><main class="app" id="app"></main>
<script>
const app = document.getElementById('app');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (!response.ok) { app.innerHTML = '<h1>Project not found</h1><button id="back">Projects</button>'; document.getElementById('back').onclick = () => navigate('/'); return; }
    const project = await response.json();
    app.innerHTML = '<button id="back">Projects</button><h1>' + escapeHtml(project.name) + '</h1>' + (project.archived ? '<p>Archived project</p>' : '<form id="rename-form"><label for="new-project-name">New project name</label><input id="new-project-name" name="name" type="text" autocomplete="off"><button type="submit">Rename project</button></form><p class="alert" id="rename-error" role="alert" hidden></p>') + '<form id="task-form"><label for="task-title">Task title</label><input id="task-title" name="title" type="text" autocomplete="off" ' + (project.archived ? 'disabled' : '') + '><button type="submit" ' + (project.archived ? 'disabled' : '') + '>Create task</button></form><p class="alert" id="task-error" role="alert" hidden></p><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><section id="tasks" aria-label="Tasks"></section>';
    document.getElementById('back').onclick = () => navigate('/');
    if (!project.archived) {
      const renameForm = document.getElementById('rename-form');
      const renameError = document.getElementById('rename-error');
      renameForm.onsubmit = async event => {
        event.preventDefault();
        const name = new FormData(renameForm).get('name').trim();
        if (!name) { renameError.textContent = 'Project name is required'; renameError.hidden = false; return; }
        const response = await fetch('/api/projects/' + match[1], {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
        if (response.ok) render();
      };
    }
    const taskForm = document.getElementById('task-form');
    const taskError = document.getElementById('task-error');
    const filter = document.getElementById('task-filter');
    const refreshTasks = async () => {
      const tasks = await (await fetch('/api/projects/' + match[1] + '/tasks')).json();
      const shown = tasks.filter(task => filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed));
      document.getElementById('tasks').innerHTML = shown.map(task => '<div class="task-row" data-testid="task-row"><span>' + escapeHtml(task.title) + '</span><input type="checkbox" aria-label="Complete ' + escapeHtml(task.title) + '" data-task="' + task.id + '" ' + (task.completed ? 'checked' : '') + (project.archived ? ' disabled' : '') + '></div>').join('');
      document.querySelectorAll('[data-task]').forEach(box => box.onchange = async () => { await fetch('/api/projects/' + match[1] + '/tasks/' + box.dataset.task, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:box.checked})}); await refreshTasks(); });
    };
    filter.onchange = refreshTasks;
    taskForm.onsubmit = async event => {
      event.preventDefault();
      const title = new FormData(taskForm).get('title').trim();
      if (!title) { taskError.textContent = 'Task title is required'; taskError.hidden = false; return; }
      const response = await fetch('/api/projects/' + match[1] + '/tasks', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});
      if (response.ok) { taskError.hidden = true; taskForm.reset(); await refreshTasks(); }
    };
    await refreshTasks();
    return;
  }
  app.innerHTML = '<h1>Workboard</h1><label for="project-filter">Project filter</label><select id="project-filter"><option>Active</option><option>Archived</option></select><form id="create-form"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></form><p class="alert" id="error" role="alert" hidden></p><section id="projects" aria-label="Projects"></section>';
  const form = document.getElementById('create-form');
  const error = document.getElementById('error');
  const refresh = async () => {
    const archived = document.getElementById('project-filter').value === 'Archived';
    const projects = await (await fetch('/api/projects?archived=' + archived)).json();
    document.getElementById('projects').innerHTML = projects.map(p => '<div class="project-row" data-testid="project-row"><span>' + escapeHtml(p.name) + '</span><span data-testid="project-summary">' + p.completedCount + '/' + p.totalCount + ' completed</span><button type="button" data-project="' + p.id + '">Open project</button><button type="button" data-archive="' + p.id + '">' + (archived ? 'Restore project' : 'Archive project') + '</button></div>').join('');
    document.querySelectorAll('[data-project]').forEach(button => button.onclick = () => navigate('/projects/' + button.dataset.project));
    document.querySelectorAll('[data-archive]').forEach(button => button.onclick = async () => { await fetch('/api/projects/' + button.dataset.archive + '/archive', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!archived})}); await refresh(); });
  };
  document.getElementById('project-filter').onchange = refresh;
  form.onsubmit = async event => {
    event.preventDefault();
    const name = new FormData(form).get('name').trim();
    if (!name) { error.textContent = 'Project name is required'; error.hidden = false; return; }
    const response = await fetch('/api/projects', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if (response.ok) { error.hidden = true; form.reset(); await refresh(); }
  };
  await refresh();
}
function navigate(path) { history.pushState({}, '', path); render(); }
window.addEventListener('popstate', render);
render();
</script></body></html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, listProjects.all(url.searchParams.get('archived') === 'true' ? 1 : 0));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    let body = ''; for await (const chunk of request) body += chunk;
    try { const value = JSON.parse(body).archived; if (typeof value !== 'boolean') throw new Error(); setArchived.run(value ? 1 : 0, Number(archiveMatch[1])); }
    catch { return sendJson(response, 400, { error: 'Invalid archived value' }); }
    return sendJson(response, 200, { status: 'ok' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Not found' });
  }
  if (request.method === 'PATCH' && projectMatch) {
    let body = ''; for await (const chunk of request) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof name !== 'string' || !name.trim()) return sendJson(response, 400, { error: 'Project name is required' });
    const id = Number(projectMatch[1]);
    const project = getProject.get(id);
    if (!project) return sendJson(response, 404, { error: 'Not found' });
    if (project.archived) return sendJson(response, 403, { error: 'Archived project' });
    renameProject.run(name.trim(), id);
    return sendJson(response, 200, getProject.get(id));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof name !== 'string' || !name.trim()) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name.trim());
    return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Not found' });
    return sendJson(response, 200, listTasks.all(projectId));
  }
  if (tasksMatch && request.method === 'POST') {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return sendJson(response, 404, { error: 'Not found' });
    let body = '';
    for await (const chunk of request) body += chunk;
    let title;
    try { title = JSON.parse(body).title; } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof title !== 'string' || !title.trim()) return sendJson(response, 400, { error: 'Task title is required' });
    const result = addTask.run(projectId, title.trim());
    return sendJson(response, 201, getTask.get(Number(result.lastInsertRowid)));
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let completed;
    try { completed = JSON.parse(body).completed; } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completed value' });
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    if (!updateTask.run(completed ? 1 : 0, taskId, projectId).changes) return sendJson(response, 404, { error: 'Not found' });
    return sendJson(response, 200, getTask.get(taskId));
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
