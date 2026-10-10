import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
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
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const app = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workboard</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#182235;font:16px/1.5 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:64px auto}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:20px;background:#fff;border:1px solid #e1e6ef;border-radius:12px}label{display:grid;gap:6px;flex:1;font-weight:600}input,select{font:inherit;border:1px solid #aeb9ca;border-radius:7px;padding:10px 12px;min-width:0}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:7px;background:#2459c4;color:white;cursor:pointer}button:hover{background:#19479f}.back{background:transparent;color:#2459c4;padding:0;margin-bottom:20px}.rows{display:grid;gap:10px;margin-top:20px}.row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:white;border:1px solid #e1e6ef;border-radius:10px;padding:14px 16px}.name{overflow-wrap:anywhere}.alert{color:#a12424;margin:12px 0 0}.empty{color:#5d6879;margin-top:20px}.task-name{display:flex;align-items:center;gap:12px;flex:1}.task-name input{width:20px;height:20px}@media(max-width:520px){form{align-items:stretch;flex-direction:column}.row{align-items:flex-start;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const root=document.querySelector('#app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function request(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error('Request failed');return response.json()}
function projectId(){const m=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);return m&&m[1]}
async function render(){const id=projectId();if(id){let project;try{project=await request('/api/projects/'+id)}catch{}if(!project){root.innerHTML='<h1>Project not found</h1><button class="back" id="back">Projects</button>';document.querySelector('#back').onclick=()=>location.assign('/');return}root.innerHTML='<button class="back" id="back">Projects</button><h1>'+escapeHtml(project.name)+'</h1><form id="create-task"><label for="task-title">Task title</label><input id="task-title" type="text" autocomplete="off"><button type="submit">Create task</button></form><div id="message" role="alert" aria-live="polite"></div><label style="margin-top:20px">Task filter<select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></label><section class="rows" id="tasks" aria-label="Tasks"></section>';document.querySelector('#back').onclick=()=>location.assign('/');const form=document.querySelector('#create-task');form.addEventListener('submit',async event=>{event.preventDefault();const title=document.querySelector('#task-title').value.trim();if(!title){document.querySelector('#message').innerHTML='<p class="alert">Task title is required</p>';return}try{await request('/api/projects/'+id+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});document.querySelector('#message').textContent='';form.reset();await loadTasks(id)}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create task</p>'}});document.querySelector('#task-filter').onchange=()=>loadTasks(id);await loadTasks(id);return}
root.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><section class="rows" id="projects" aria-label="Projects"></section>';
const form=document.querySelector('#create');form.addEventListener('submit',async event=>{event.preventDefault();const name=document.querySelector('#project-name').value.trim();if(!name){document.querySelector('#message').innerHTML='<p class="alert">Project name is required</p>';return}try{await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});document.querySelector('#message').textContent='';form.reset();await loadProjects()}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create project</p>'}});await loadProjects()}
async function loadProjects(){const projects=await request('/api/projects');const list=document.querySelector('#projects');list.innerHTML=projects.length?projects.map(p=>'<div class="row" data-testid="project-row"><span class="name">'+escapeHtml(p.name)+'</span><button type="button" data-id="'+p.id+'">Open project</button></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>location.assign('/projects/'+button.dataset.id)))}
async function loadTasks(id){const filter=document.querySelector('#task-filter').value;const tasks=await request('/api/projects/'+id+'/tasks');const shown=tasks.filter(t=>filter==='All'||(filter==='Open'&&!t.completed)||(filter==='Completed'&&t.completed));const list=document.querySelector('#tasks');list.innerHTML=shown.length?shown.map(t=>'<div class="row" data-testid="task-row"><label class="task-name"><input type="checkbox" aria-label="Complete '+escapeHtml(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+'><span class="name">'+escapeHtml(t.title)+'</span></label></div>').join(''):'<p class="empty">No tasks to show.</p>';list.querySelectorAll('input[type=checkbox]').forEach(box=>box.addEventListener('change',async()=>{await request('/api/tasks/'+box.dataset.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:box.checked})});await loadTasks(id)}))}
render();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, db.prepare('SELECT id, name FROM projects WHERE id = ?').get(result.lastInsertRowid));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC').all(projectId).map(t => ({ ...t, completed: !!t.completed })));
  }
  if (req.method === 'POST' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    const data = await readJson(req);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) return send(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    const task = db.prepare('SELECT id, title, completed FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    return send(res, 201, { ...task, completed: !!task.completed });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const data = await readJson(req);
    if (typeof data?.completed !== 'boolean') return send(res, 400, { error: 'Completion state is required' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { ok: true });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(res, 200, app, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { db.close(); process.exit(0); });
});
