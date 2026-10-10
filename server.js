import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const app = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#182235;font:16px/1.5 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:64px auto}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:20px;background:#fff;border:1px solid #e1e6ef;border-radius:12px}label{display:grid;gap:6px;flex:1;font-weight:600}input,select{font:inherit;border:1px solid #aeb9ca;border-radius:7px;padding:10px 12px;min-width:0}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:7px;background:#2459c4;color:white;cursor:pointer}button:hover{background:#19479f}button:disabled{opacity:.55;cursor:not-allowed}.back{background:transparent;color:#2459c4;padding:0;margin-bottom:20px}.rows{display:grid;gap:10px;margin-top:20px}.row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:white;border:1px solid #e1e6ef;border-radius:10px;padding:14px 16px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.summary{color:#5d6879}.name{overflow-wrap:anywhere}.alert{color:#a12424;margin:12px 0 0}.empty{color:#5d6879;margin-top:20px}.task-name{display:flex;align-items:center;gap:12px;flex:1}.task-name input{width:20px;height:20px}.task-row form{margin:0;padding:0;border:0;background:transparent;flex:1}.task-row form input{width:100%}.filter{margin-top:20px}@media(max-width:520px){form{align-items:stretch;flex-direction:column}.row{align-items:flex-start;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const root=document.querySelector('#app');
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function req(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error('Request failed');return r.json()}
function pid(){return location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/)?.[1]}
function options(method,body){return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}}
async function render(){const id=pid();if(id){let p;try{p=await req('/api/projects/'+id)}catch{}if(!p){root.innerHTML='<h1>Project not found</h1><button class="back" id="back">Projects</button>';document.querySelector('#back').onclick=()=>location.assign('/');return}
root.innerHTML='<button class="back" id="back">Projects</button><h1>'+esc(p.name)+'</h1>'+(p.archived?'<p>Archived project</p>':'')+'<form id="rename-project"><label for="new-project-name">New project name</label><input id="new-project-name" type="text" autocomplete="off" '+(p.archived?'disabled':'')+'><button type="submit" '+(p.archived?'disabled':'')+'>Rename project</button></form><form id="create-task"><label for="task-title">Task title</label><input id="task-title" type="text" autocomplete="off"><button type="submit" '+(p.archived?'disabled':'')+'>Create task</button></form><div id="message" role="alert" aria-live="polite"></div><label class="filter">Task filter<select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></label><section class="rows" id="tasks" aria-label="Tasks"></section>';
document.querySelector('#back').onclick=()=>location.assign('/');const rename=document.querySelector('#rename-project');rename.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#new-project-name').value.trim();const message=document.querySelector('#message');if(!name){message.innerHTML='<p class="alert">Project name is required</p>';return}try{await req('/api/projects/'+id,options('PATCH',{name}));message.textContent='';await render()}catch{message.innerHTML='<p class="alert">Unable to rename project</p>'}});const form=document.querySelector('#create-task');form.addEventListener('submit',async e=>{e.preventDefault();const title=document.querySelector('#task-title').value.trim();if(!title){document.querySelector('#message').innerHTML='<p class="alert">Task title is required</p>';return}try{await req('/api/projects/'+id+'/tasks',options('POST',{title}));document.querySelector('#message').textContent='';form.reset();await loadTasks(id,p.archived)}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create task</p>'}});document.querySelector('#task-filter').onchange=()=>loadTasks(id,p.archived);await loadTasks(id,p.archived);return}
root.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" type="text" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><label class="filter">Project filter<select id="project-filter"><option>Active</option><option>Archived</option></select></label><section class="rows" id="projects" aria-label="Projects"></section>';
const form=document.querySelector('#create');form.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#project-name').value.trim();if(!name){document.querySelector('#message').innerHTML='<p class="alert">Project name is required</p>';return}try{await req('/api/projects',options('POST',{name}));document.querySelector('#message').textContent='';form.reset();await loadProjects()}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create project</p>'}});document.querySelector('#project-filter').onchange=loadProjects;await loadProjects()}
async function loadProjects(){const archived=document.querySelector('#project-filter').value==='Archived';const projects=await req('/api/projects?filter='+(archived?'archived':'active'));const list=document.querySelector('#projects');list.innerHTML=projects.length?projects.map(p=>'<div class="row" data-testid="project-row"><span class="name">'+esc(p.name)+'</span><span class="summary" data-testid="project-summary">'+p.completed_count+'/'+p.total_count+' completed</span><div class="actions"><button type="button" data-open="'+p.id+'">Open project</button><button type="button" data-action="'+(archived?'restore':'archive')+'" data-id="'+p.id+'">'+(archived?'Restore project':'Archive project')+'</button></div></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>location.assign('/projects/'+b.dataset.open));list.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{await req('/api/projects/'+b.dataset.id+'/'+b.dataset.action,options('POST',{}));await loadProjects()})}
async function loadTasks(id,archived){const filter=document.querySelector('#task-filter').value;const tasks=await req('/api/projects/'+id+'/tasks');const shown=tasks.filter(t=>filter==='All'||(filter==='Open'&&!t.completed)||(filter==='Completed'&&t.completed));const list=document.querySelector('#tasks');list.innerHTML=shown.length?shown.map(t=>'<div class="row task-row" data-testid="task-row"><label class="task-name"><input type="checkbox" aria-label="Complete '+esc(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+' '+(archived?'disabled':'')+'><span class="name">'+esc(t.title)+'</span></label><form data-task="'+t.id+'"><label for="new-task-'+t.id+'">New task title</label><input id="new-task-'+t.id+'" type="text" autocomplete="off" '+(archived?'disabled':'')+'><button type="submit" '+(archived?'disabled':'')+'>Rename task</button></form><label>Task priority<select aria-label="Task priority" data-priority="'+t.id+'" '+(archived?'disabled':'')+'><option '+(t.priority==='Low'?'selected':'')+'>Low</option><option '+(t.priority==='Normal'?'selected':'')+'>Normal</option><option '+(t.priority==='High'?'selected':'')+'>High</option></select></label></div>').join(''):'<p class="empty">No tasks to show.</p>';list.querySelectorAll('input[type=checkbox]').forEach(box=>box.addEventListener('change',async()=>{await req('/api/tasks/'+box.dataset.id,options('PATCH',{completed:box.checked}));await loadTasks(id,archived)}));list.querySelectorAll('select[data-priority]').forEach(select=>select.addEventListener('change',async()=>{await req('/api/tasks/'+select.dataset.priority,options('PATCH',{priority:select.value}))}));list.querySelectorAll('form[data-task]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const title=form.querySelector('input').value.trim();const message=document.querySelector('#message');if(!title){message.innerHTML='<p class="alert">Task title is required</p>';return}try{await req('/api/tasks/'+form.dataset.task,options('PATCH',{title}));message.textContent='';await loadTasks(id,archived)}catch{message.innerHTML='<p class="alert">Unable to rename task</p>'}}))}
render();
</script></main></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'archived' ? 1 : 0;
    return send(res, 200, db.prepare(`SELECT p.id,p.name,p.archived,COUNT(t.id) AS total_count,COALESCE(SUM(t.completed),0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived=? GROUP BY p.id ORDER BY p.id ASC`).all(archived).map(p=>({...p,archived:!!p.archived})));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req); const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, db.prepare('SELECT id,name,archived FROM projects WHERE id=?').get(result.lastInsertRowid));
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && renameMatch) {
    const data = await readJson(req); const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('UPDATE projects SET name=? WHERE id=? AND archived=0').run(name, Number(renameMatch[1]));
    if (!result.changes) return send(res, 404, { error: 'Project not found or archived' });
    const project = db.prepare('SELECT id,name,archived FROM projects WHERE id=?').get(Number(renameMatch[1]));
    return send(res, 200, { ...project, archived: !!project.archived });
  }
  const actionMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if(req.method==='POST'&&actionMatch){const archived=actionMatch[2]==='archive'?1:0;const result=db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archived,Number(actionMatch[1]));return result.changes?send(res,200,{ok:true}):send(res,404,{error:'Project not found'})}
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {const projectId=Number(tasksMatch[1]);if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))return send(res,404,{error:'Project not found'});return send(res,200,db.prepare('SELECT id,title,completed,priority FROM tasks WHERE project_id=? ORDER BY id ASC').all(projectId).map(t=>({...t,completed:!!t.completed})))}
  if (req.method === 'POST' && tasksMatch) {const projectId=Number(tasksMatch[1]);const project=db.prepare('SELECT archived FROM projects WHERE id=?').get(projectId);if(!project)return send(res,404,{error:'Project not found'});if(project.archived)return send(res,409,{error:'Archived project'});const data=await readJson(req);const title=typeof data?.title==='string'?data.title.trim():'';if(!title)return send(res,400,{error:'Task title is required'});const result=db.prepare('INSERT INTO tasks (project_id,title) VALUES (?,?)').run(projectId,title);const t=db.prepare('SELECT id,title,completed FROM tasks WHERE id=?').get(result.lastInsertRowid);return send(res,201,{...t,completed:!!t.completed})}
  const taskMatch=url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if(req.method==='PATCH'&&taskMatch){const data=await readJson(req);const taskId=Number(taskMatch[1]);const task=db.prepare('SELECT tasks.id,projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(taskId);if(!task||task.archived)return send(res,404,{error:'Task not found or project archived'});if(typeof data?.title==='string'){const title=data.title.trim();if(!title)return send(res,400,{error:'Task title is required'});db.prepare('UPDATE tasks SET title=? WHERE id=?').run(title,taskId);return send(res,200,{ok:true})}if(typeof data?.priority==='string'){if(!['Low','Normal','High'].includes(data.priority))return send(res,400,{error:'Invalid priority'});db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(data.priority,taskId);return send(res,200,{ok:true})}if(typeof data?.completed!=='boolean')return send(res,400,{error:'Completion state is required'});db.prepare('UPDATE tasks SET completed=? WHERE id=?').run(data.completed?1:0,taskId);return send(res,200,{ok:true})}
  const projectMatch=url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if(req.method==='GET'&&projectMatch){const p=db.prepare('SELECT id,name,archived FROM projects WHERE id=?').get(Number(projectMatch[1]));return p?send(res,200,{...p,archived:!!p.archived}):send(res,404,{error:'Project not found'})}
  if(req.method==='GET'&&(url.pathname==='/'||/^\/projects\/\d+\/?$/.test(url.pathname)))return send(res,200,app,'text/html; charset=utf-8');
  send(res,404,{error:'Not found'});
});
server.listen(port,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
