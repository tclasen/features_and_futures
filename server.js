import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workboard</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#202936;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:56px auto;padding:32px;background:white;border:1px solid #dfe4ea;border-radius:12px;box-shadow:0 8px 24px #172b4d0d}h1{margin:0 0 24px;font-size:2rem}form{display:flex;gap:12px;align-items:end}label{display:grid;gap:6px;font-weight:600;flex:1}input{font:inherit;padding:10px 12px;border:1px solid #aeb8c4;border-radius:6px}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:6px;background:#2457c5;color:white;cursor:pointer}button:hover{background:#1946a7}button:focus-visible,input:focus-visible{outline:3px solid #85a9ff;outline-offset:2px}.rows{display:grid;gap:10px;margin-top:24px}.row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:1px solid #dfe4ea;border-radius:8px}.alert{margin-top:12px;color:#a42525;font-weight:600}.empty{color:#586575}a{color:inherit}@media(max-width:600px){main{margin:20px 12px;padding:22px}form{align-items:stretch;flex-direction:column}}
</style></head><body><main id="app"><h1>Workboard</h1><form id="create-form"><label for="project-name">Project name</label><input id="project-name" name="name" autocomplete="off"><button type="submit">Create project</button></form><div id="message" class="alert" role="alert" aria-live="polite"></div><section id="projects" class="rows" aria-label="Projects"></section></main>
<script>
const app=document.querySelector('#app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadProjects(){const response=await fetch('/api/projects');const projects=await response.json();const list=document.querySelector('#projects');list.innerHTML=projects.length?projects.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><button type="button" data-open="'+p.id+'">Open project</button></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>location.href='/projects/'+button.dataset.open))}
function projectPage(project){document.title=project.name+' · Workboard';app.innerHTML='<button type="button" id="back">Projects</button><h1>'+escapeHtml(project.name)+'</h1><form id="task-form"><label for="task-title">Task title</label><input id="task-title" name="title" autocomplete="off"><button type="submit">Create task</button></form><div id="task-message" class="alert" role="alert" aria-live="polite"></div><label for="task-filter" style="margin-top:20px">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><section id="tasks" class="rows" aria-label="Tasks"></section>';document.querySelector('#back').addEventListener('click',()=>location.href='/');const message=document.querySelector('#task-message'),input=document.querySelector('#task-title');document.querySelector('#task-form').addEventListener('submit',async event=>{event.preventDefault();const title=input.value.trim();if(!title){message.textContent='Task title is required';input.focus();return}message.textContent='';const response=await fetch('/api/projects/'+project.id+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});if(response.ok){input.value='';await loadTasks(project.id)}});document.querySelector('#task-filter').addEventListener('change',()=>loadTasks(project.id));loadTasks(project.id)}
async function loadTasks(projectId){const response=await fetch('/api/projects/'+projectId+'/tasks');if(!response.ok)return;const tasks=await response.json(),filter=document.querySelector('#task-filter').value;const shown=tasks.filter(t=>filter==='All'||(filter==='Open'&&!t.completed)||(filter==='Completed'&&t.completed));const list=document.querySelector('#tasks');list.innerHTML=shown.length?shown.map(t=>'<div class="row" data-testid="task-row"><span>'+escapeHtml(t.title)+'</span><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" aria-label="Complete '+escapeHtml(t.title)+'" data-task="'+t.id+'" '+(t.completed?'checked':'')+'></label></div>').join(''):'<p class="empty">No tasks match this filter.</p>';list.querySelectorAll('[data-task]').forEach(box=>box.addEventListener('change',async()=>{await fetch('/api/tasks/'+box.dataset.task,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:box.checked})});await loadTasks(projectId)}))}
async function start(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){location.replace('/');return}projectPage(await response.json());return}if(location.pathname!=='/'){location.replace('/');return}document.querySelector('#create-form').addEventListener('submit',async event=>{event.preventDefault();const input=document.querySelector('#project-name');const name=input.value.trim();const message=document.querySelector('#message');if(!name){message.textContent='Project name is required';input.focus();return}message.textContent='';const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(response.ok){input.value='';await loadProjects()}});await loadProjects()}
start();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
    return json(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (req.method === 'POST' && tasksMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const projectId = Number(tasksMatch[1]);
      if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return json(res, 404, { error: 'Project not found' });
      const title = String(JSON.parse(body).title ?? '').trim();
      if (!title) return json(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return json(res, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const completed = JSON.parse(body).completed;
      if (typeof completed !== 'boolean') return json(res, 400, { error: 'Invalid completion state' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskMatch[1]));
      return result.changes ? json(res, 200, { id: Number(taskMatch[1]), completed }) : json(res, 404, { error: 'Task not found' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  json(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
