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
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low','Normal','High')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High')),
  due_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  creation_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'creation_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN creation_order INTEGER');
}
db.exec('UPDATE tasks SET creation_order=id WHERE creation_order IS NULL');
const nextPosition = db.prepare('SELECT COALESCE(MAX(position),0)+1 AS position FROM task_project_positions WHERE project_id=?');
const addPosition = db.prepare('INSERT OR IGNORE INTO task_project_positions (task_id,project_id,position) VALUES (?,?,?)');
const untrackedTasks = db.prepare(`SELECT t.id,t.project_id FROM tasks t LEFT JOIN task_project_positions x ON x.task_id=t.id AND x.project_id=t.project_id WHERE x.task_id IS NULL ORDER BY t.project_id,t.creation_order,t.id`).all();
for (const task of untrackedTasks) addPosition.run(task.id, task.project_id, nextPosition.get(task.project_id).position);

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
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
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#182235;font:16px/1.5 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:64px auto}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:20px;background:#fff;border:1px solid #e1e6ef;border-radius:12px}label{display:grid;gap:6px;flex:1;font-weight:600}input,select,textarea{font:inherit;border:1px solid #aeb9ca;border-radius:7px;padding:10px 12px;min-width:0}textarea{min-height:90px;resize:vertical}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:7px;background:#2459c4;color:white;cursor:pointer}button:hover{background:#19479f}button:disabled{opacity:.55;cursor:not-allowed}.back{background:transparent;color:#2459c4;padding:0;margin-bottom:20px}.rows{display:grid;gap:10px;margin-top:20px}.row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:white;border:1px solid #e1e6ef;border-radius:10px;padding:14px 16px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.summary{color:#5d6879}.name{overflow-wrap:anywhere}.alert{color:#a12424;margin:12px 0 0}.empty{color:#5d6879;margin-top:20px}.task-name{display:flex;align-items:center;gap:12px;flex:1}.task-name input{width:20px;height:20px}.task-row form{margin:0;padding:0;border:0;background:transparent;flex:1}.task-row form input{width:100%}.filter{margin-top:20px}@media(max-width:520px){form{align-items:stretch;flex-direction:column}.row{align-items:flex-start;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const root=document.querySelector('#app');
let appliedDueRange={from:'',through:''};
let appliedTaskSearch='';
let appliedProjectSearch='';
function asciiLower(v){return String(v).replace(/[A-Z]/g,c=>c.toLowerCase())}
function searchKey(v){return asciiLower(String(v).replace(/[ \t]+/g,' '))}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function req(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error('Request failed');return r.json()}
function pid(){return location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/)?.[1]}
function options(method,body){return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}}
async function render(){const id=pid();if(id){let p;try{p=await req('/api/projects/'+id)}catch{}if(!p){root.innerHTML='<h1>Project not found</h1><button class="back" id="back">Projects</button>';document.querySelector('#back').onclick=()=>location.assign('/');return}
root.innerHTML='<button class="back" id="back">Projects</button><h1>'+esc(p.name)+'</h1>'+(p.archived?'<p>Archived project</p>':'')+'<form id="rename-project"><label for="new-project-name">New project name</label><input id="new-project-name" type="text" autocomplete="off" '+(p.archived?'disabled':'')+'><button type="submit" '+(p.archived?'disabled':'')+'>Rename project</button></form><form id="create-task"><label for="task-title">Task title</label><input id="task-title" type="text" autocomplete="off"><button type="submit" '+(p.archived?'disabled':'')+'>Create task</button></form><div id="message" role="alert" aria-live="polite"></div><form class="filter" id="task-search-form"><label for="task-search">Task search</label><input id="task-search" type="text" autocomplete="off"><button type="submit">Search tasks</button></form><label class="filter">Default task priority<select id="default-task-priority" '+(p.archived?'disabled':'')+'><option '+(p.default_priority==='Low'?'selected':'')+'>Low</option><option '+(p.default_priority==='Normal'?'selected':'')+'>Normal</option><option '+(p.default_priority==='High'?'selected':'')+'>High</option></select></label><label class="filter">Task filter<select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></label><label class="filter">Priority filter<select id="priority-filter"><option>All</option><option>Low</option><option>Normal</option><option>High</option></select></label><div class="filter" id="due-range"><label for="due-from">Due from</label><input id="due-from" type="text" value=""><label for="due-through">Due through</label><input id="due-through" type="text" value=""><button type="button" id="apply-due-range">Apply due range</button></div><section class="rows" id="tasks" aria-label="Tasks"></section>';
document.querySelector('#task-search-form').addEventListener('submit',e=>{e.preventDefault();appliedTaskSearch=document.querySelector('#task-search').value.trim();loadTasks(id,p.archived)});document.querySelector('#back').onclick=()=>location.assign('/');document.querySelector('#default-task-priority').onchange=async e=>{try{await req('/api/projects/'+id,options('PATCH',{default_priority:e.target.value}));p.default_priority=e.target.value}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to update default priority</p>'}};const rename=document.querySelector('#rename-project');rename.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#new-project-name').value.trim();const message=document.querySelector('#message');if(!name){message.innerHTML='<p class="alert">Project name is required</p>';return}try{await req('/api/projects/'+id,options('PATCH',{name}));document.querySelector('h1').textContent=name;message.textContent=''}catch{message.innerHTML='<p class="alert">Unable to rename project</p>'}});const form=document.querySelector('#create-task');form.addEventListener('submit',async e=>{e.preventDefault();const title=document.querySelector('#task-title').value.trim();if(!title){document.querySelector('#message').innerHTML='<p class="alert">Task title is required</p>';return}try{await req('/api/projects/'+id+'/tasks',options('POST',{title}));document.querySelector('#message').textContent='';form.reset();await loadTasks(id,p.archived)}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create task</p>'}});document.querySelector('#task-filter').onchange=()=>loadTasks(id,p.archived);document.querySelector('#priority-filter').onchange=()=>loadTasks(id,p.archived);document.querySelector('#apply-due-range').onclick=()=>{const from=document.querySelector('#due-from').value.trim(),through=document.querySelector('#due-through').value.trim(),message=document.querySelector('#message');const valid=s=>{if(!s)return true;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1||m<1||m>12||d<1)return false;const days=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return d<=days[m-1]};if(!valid(from)||!valid(through)){message.innerHTML='<p class="alert">Due range must use valid YYYY-MM-DD dates</p>';return}if(from&&through&&from>through){message.innerHTML='<p class="alert">Due from must not be after Due through</p>';return}appliedDueRange={from,through};message.textContent='';loadTasks(id,p.archived)};await loadTasks(id,p.archived);return}
root.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" type="text" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><form class="filter" id="project-search-form"><label for="project-search">Project search</label><input id="project-search" type="text" autocomplete="off"><button type="submit">Search projects</button></form><label class="filter">Project filter<select id="project-filter"><option>Active</option><option>Archived</option></select></label><section class="rows" id="projects" aria-label="Projects"></section>';
const form=document.querySelector('#create');form.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#project-name').value.trim();if(!name){document.querySelector('#message').innerHTML='<p class="alert">Project name is required</p>';return}try{await req('/api/projects',options('POST',{name}));document.querySelector('#message').textContent='';form.reset();await loadProjects()}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create project</p>'}});document.querySelector('#project-filter').onchange=loadProjects;document.querySelector('#project-search-form').addEventListener('submit',e=>{e.preventDefault();appliedProjectSearch=document.querySelector('#project-search').value.trim();loadProjects()});await loadProjects()}
async function loadProjects(){const archived=document.querySelector('#project-filter').value==='Archived';const projects=await req('/api/projects?filter='+(archived?'archived':'active'));const query=searchKey(appliedProjectSearch);const matched=projects.filter(p=>searchKey(p.name).includes(query));const list=document.querySelector('#projects');list.innerHTML=matched.length?matched.map(p=>'<div class="row" data-testid="project-row"><span class="name">'+esc(p.name)+'</span><span class="summary" data-testid="project-summary">'+p.completed_count+'/'+p.total_count+' completed</span><div class="actions"><button type="button" data-open="'+p.id+'">Open project</button><button type="button" data-action="'+(archived?'restore':'archive')+'" data-id="'+p.id+'">'+(archived?'Restore project':'Archive project')+'</button></div></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>location.assign('/projects/'+b.dataset.open));list.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{await req('/api/projects/'+b.dataset.id+'/'+b.dataset.action,options('POST',{}));await loadProjects()})}
async function loadTasks(id,archived){const filter=document.querySelector('#task-filter').value;const priorityFilter=document.querySelector('#priority-filter').value;const tasks=await req('/api/projects/'+id+'/tasks');const projects=await req('/api/projects?filter=active');const destinations=projects.filter(p=>String(p.id)!==String(id));const query=searchKey(appliedTaskSearch);const shown=tasks.filter(t=>searchKey(t.title).includes(query)&&(filter==='All'||(filter==='Open'&&!t.completed)||(filter==='Completed'&&t.completed))&&(priorityFilter==='All'||t.priority===priorityFilter)&&(!appliedDueRange.from&&!appliedDueRange.through||!!t.due_date&&(!appliedDueRange.from||t.due_date>=appliedDueRange.from)&&(!appliedDueRange.through||t.due_date<=appliedDueRange.through)));const list=document.querySelector('#tasks');list.innerHTML=shown.length?shown.map(t=>'<div class="row task-row" data-testid="task-row"><label class="task-name"><input type="checkbox" aria-label="Complete '+esc(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+' '+(archived?'disabled':'')+'><span class="name">'+esc(t.title)+'</span></label><form data-task="'+t.id+'"><label for="new-task-'+t.id+'">New task title</label><input id="new-task-'+t.id+'" type="text" autocomplete="off" '+(archived?'disabled':'')+'><button type="submit" '+(archived?'disabled':'')+'>Rename task</button></form><label>Task priority<select aria-label="Task priority" data-priority="'+t.id+'" '+(archived?'disabled':'')+'><option '+(t.priority==='Low'?'selected':'')+'>Low</option><option '+(t.priority==='Normal'?'selected':'')+'>Normal</option><option '+(t.priority==='High'?'selected':'')+'>High</option></select></label><form class="due-date-form" data-due="'+t.id+'"><label for="due-date-'+t.id+'">Task due date</label><input id="due-date-'+t.id+'" type="text" aria-label="Task due date" value="'+esc(t.due_date||'')+'" '+(archived?'disabled':'')+'><button type="submit" '+(archived?'disabled':'')+'>Save due date</button></form><div class="notes-form"><label for="task-notes-'+t.id+'">Task notes</label><textarea id="task-notes-'+t.id+'" aria-label="Task notes" '+(archived?'disabled':'')+'></textarea><button type="button" data-save-notes="'+t.id+'" '+(archived?'disabled':'')+'>Save notes</button></div><label>Destination project<select aria-label="Destination project" data-destination="'+t.id+'" '+(archived||!destinations.length?'disabled':'')+'>'+destinations.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label><button type="button" data-move="'+t.id+'" '+(archived||!destinations.length?'disabled':'')+'>Move task</button></div>').join(''):'<p class="empty">No tasks to show.</p>';for(const task of shown){const editor=list.querySelector('#task-notes-'+task.id);if(editor)editor.value=task.notes??''}list.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',async()=>{const destination=list.querySelector('[data-destination="'+button.dataset.move+'"]').value;try{await req('/api/tasks/'+button.dataset.move,options('PATCH',{project_id:Number(destination)}));await loadTasks(id,archived)}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to move task</p>'}}));list.querySelectorAll('input[type=checkbox]').forEach(box=>box.addEventListener('change',async()=>{await req('/api/tasks/'+box.dataset.id,options('PATCH',{completed:box.checked}));await loadTasks(id,archived)}));list.querySelectorAll('select[data-priority]').forEach(select=>select.addEventListener('change',async()=>{await req('/api/tasks/'+select.dataset.priority,options('PATCH',{priority:select.value}));await loadTasks(id,archived)}));list.querySelectorAll('form[data-task]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const title=form.querySelector('input').value.trim();const message=document.querySelector('#message');if(!title){message.innerHTML='<p class="alert">Task title is required</p>';return}try{await req('/api/tasks/'+form.dataset.task,options('PATCH',{title}));message.textContent='';await loadTasks(id,archived)}catch{message.innerHTML='<p class="alert">Unable to rename task</p>'}}));list.querySelectorAll('[data-save-notes]').forEach(button=>button.addEventListener('click',async()=>{const notes=list.querySelector('#task-notes-'+button.dataset.saveNotes).value;try{await req('/api/tasks/'+button.dataset.saveNotes,options('PATCH',{notes}));document.querySelector('#message').textContent='';await loadTasks(id,archived)}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to save notes</p>'}}));list.querySelectorAll('form[data-due]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const due_date=form.querySelector('input').value.trim();const message=document.querySelector('#message');try{await req('/api/tasks/'+form.dataset.due,options('PATCH',{due_date}));message.textContent='';await loadTasks(id,archived)}catch{message.innerHTML='<p class="alert">Due date must be a valid YYYY-MM-DD date</p>'}}))}
render();
</script></main></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'archived' ? 1 : 0;
    return send(res, 200, db.prepare(`SELECT p.id,p.name,p.archived,p.default_priority,COUNT(t.id) AS total_count,COALESCE(SUM(t.completed),0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived=? GROUP BY p.id ORDER BY p.id ASC`).all(archived).map(p=>({...p,archived:!!p.archived})));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req); const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, db.prepare('SELECT id,name,archived,default_priority FROM projects WHERE id=?').get(result.lastInsertRowid));
  }
  const renameMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && renameMatch) {
    const data = await readJson(req); const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const projectId = Number(renameMatch[1]);
    let result;
    if (typeof data?.name === 'string') { if (!name) return send(res, 400, { error: 'Project name is required' }); result = db.prepare('UPDATE projects SET name=? WHERE id=? AND archived=0').run(name, projectId); }
    else if (typeof data?.default_priority === 'string' && ['Low','Normal','High'].includes(data.default_priority)) result = db.prepare('UPDATE projects SET default_priority=? WHERE id=? AND archived=0').run(data.default_priority, projectId);
    else return send(res, 400, { error: 'Invalid project update' });
    if (!result.changes) return send(res, 404, { error: 'Project not found or archived' });
    const project = db.prepare('SELECT id,name,archived,default_priority FROM projects WHERE id=?').get(projectId);
    return send(res, 200, { ...project, archived: !!project.archived });
  }
  const actionMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/(archive|restore)$/);
  if(req.method==='POST'&&actionMatch){const archived=actionMatch[2]==='archive'?1:0;const result=db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archived,Number(actionMatch[1]));return result.changes?send(res,200,{ok:true}):send(res,404,{error:'Project not found'})}
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {const projectId=Number(tasksMatch[1]);if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))return send(res,404,{error:'Project not found'});return send(res,200,db.prepare('SELECT t.id,t.title,t.completed,t.priority,t.due_date,t.notes FROM tasks t JOIN task_project_positions x ON x.task_id=t.id AND x.project_id=t.project_id WHERE t.project_id=? ORDER BY x.position ASC,t.id ASC').all(projectId).map(t=>({...t,completed:!!t.completed})))}
  if (req.method === 'POST' && tasksMatch) {const projectId=Number(tasksMatch[1]);const project=db.prepare('SELECT archived,default_priority FROM projects WHERE id=?').get(projectId);if(!project)return send(res,404,{error:'Project not found'});if(project.archived)return send(res,409,{error:'Archived project'});const data=await readJson(req);const title=typeof data?.title==='string'?data.title.trim():'';if(!title)return send(res,400,{error:'Task title is required'});db.exec('BEGIN');let t;try{const result=db.prepare('INSERT INTO tasks (project_id,title,priority,creation_order) VALUES (?,?,?,(SELECT COALESCE(MAX(creation_order),0)+1 FROM tasks WHERE project_id=?))').run(projectId,title,project.default_priority,projectId);addPosition.run(result.lastInsertRowid,projectId,nextPosition.get(projectId).position);t=db.prepare('SELECT id,title,completed FROM tasks WHERE id=?').get(result.lastInsertRowid);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}return send(res,201,{...t,completed:!!t.completed})}
  const taskMatch=url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if(req.method==='PATCH'&&taskMatch){const data=await readJson(req);const taskId=Number(taskMatch[1]);const task=db.prepare('SELECT tasks.id,tasks.project_id,projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(taskId);if(!task||task.archived)return send(res,404,{error:'Task not found or project archived'});if(Number.isInteger(data?.project_id)){const destination=db.prepare('SELECT id,archived FROM projects WHERE id=?').get(data.project_id);if(!destination||destination.archived)return send(res,400,{error:'Destination project must be active'});db.exec('BEGIN');try{if(!db.prepare('SELECT 1 FROM task_project_positions WHERE task_id=? AND project_id=?').get(taskId,data.project_id))addPosition.run(taskId,data.project_id,nextPosition.get(data.project_id).position);db.prepare('UPDATE tasks SET project_id=?,creation_order=(SELECT COALESCE(MAX(creation_order),0)+1 FROM tasks WHERE project_id=?) WHERE id=?').run(data.project_id,data.project_id,taskId);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}return send(res,200,{ok:true})}if(typeof data?.notes==='string'){db.prepare('UPDATE tasks SET notes=? WHERE id=?').run(data.notes,taskId);return send(res,200,{ok:true})}if(typeof data?.due_date==='string'){const dueDate=data.due_date.trim();if(dueDate!==''&&!validDueDate(dueDate))return send(res,400,{error:'Due date must be a valid YYYY-MM-DD date'});db.prepare('UPDATE tasks SET due_date=? WHERE id=?').run(dueDate||null,taskId);return send(res,200,{ok:true})}if(typeof data?.title==='string'){const title=data.title.trim();if(!title)return send(res,400,{error:'Task title is required'});db.prepare('UPDATE tasks SET title=? WHERE id=?').run(title,taskId);return send(res,200,{ok:true})}if(typeof data?.priority==='string'){if(!['Low','Normal','High'].includes(data.priority))return send(res,400,{error:'Invalid priority'});db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(data.priority,taskId);return send(res,200,{ok:true})}if(typeof data?.completed!=='boolean')return send(res,400,{error:'Completion state is required'});db.prepare('UPDATE tasks SET completed=? WHERE id=?').run(data.completed?1:0,taskId);return send(res,200,{ok:true})}
  const projectMatch=url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if(req.method==='GET'&&projectMatch){const p=db.prepare('SELECT id,name,archived,default_priority FROM projects WHERE id=?').get(Number(projectMatch[1]));return p?send(res,200,{...p,archived:!!p.archived}):send(res,404,{error:'Project not found'})}
  if(req.method==='GET'&&(url.pathname==='/'||/^\/projects\/\d+\/?$/.test(url.pathname)))return send(res,200,app,'text/html; charset=utf-8');
  send(res,404,{error:'Not found'});
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) send(res, 500, { error: 'Internal server error' });
    else res.destroy();
  }
});
server.listen(port,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
