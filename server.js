import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER'); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec('UPDATE tasks SET position=id WHERE position IS NULL');
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id)
);
INSERT OR IGNORE INTO task_project_positions(task_id, project_id, position)
SELECT id, project_id, position FROM tasks;`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:#fff;border-bottom:1px solid #e1e6ef;padding:18px max(24px,calc((100% - 900px)/2));font-size:20px;font-weight:700}.container{max-width:900px;margin:48px auto;padding:0 24px}h1{font-size:32px;margin:0 0 24px}form{display:flex;gap:12px;max-width:600px;margin-bottom:24px}input,select{border:1px solid #b9c3d2;border-radius:6px;padding:11px 12px;font:inherit}input{flex:1;min-width:0}button{border:0;border-radius:6px;background:#265bd5;color:white;padding:11px 16px;font:600 15px inherit;cursor:pointer}button:hover{background:#1949b7}.row{background:white;border:1px solid #e1e6ef;border-radius:8px;padding:16px;margin:10px 0;display:flex;align-items:center;justify-content:space-between}.row button{padding:8px 14px}.alert{color:#a32626;margin:0 0 14px}[hidden]{display:none}.task-label{display:flex;align-items:center;gap:12px}.task-label input{flex:initial}
</style></head><body><header>Workboard</header><main class="container" id="app"></main>
<script>
const app=document.getElementById('app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalizeSearch(value){return String(value).replace(/[ \\t]+/g,' ').toLowerCase();}
async function render(){if(location.pathname==='/directory'){app.innerHTML='<button id="directory-back">Projects</button><h1>Task directory</h1><label>Project scope <select id="scope"><option>Active</option><option>Archived</option></select></label><label>Task filter <select id="dfilter"><option>All</option><option>Open</option><option>Completed</option><option>Deleted</option></select></label><label>Priority filter <select id="dpriority"><option>All</option><option>Low</option><option>Normal</option><option>High</option></select></label><label>Directory order <select id="directory-order"><option>Original</option><option>Priority</option><option>Due date</option><option>Title</option></select></label><form id="dsearchform"><input id="dsearch" aria-label="Directory search"><button>Search directory</button></form><label>Due from <input id="dfrom" aria-label="Due from"></label><label>Due through <input id="dthrough" aria-label="Due through"></label><button id="dapply">Apply due range</button><p class="alert" id="dalert" role="alert" hidden></p><button id="complete-visible">Complete visible tasks</button><button id="reopen-visible">Reopen visible tasks</button><p data-testid="directory-summary" id="directory-summary">0/0 completed</p><p id="directory-empty" hidden>No matching tasks</p><section id="directory-results"></section>';document.getElementById('directory-back').onclick=()=>{history.pushState({},'','/');render()};const all=await(await fetch('/api/directory')).json(),scope=document.getElementById('scope'),tf=document.getElementById('dfilter'),pf=document.getElementById('dpriority');let query='',range={from:'',through:''};function draw(){const q=normalizeSearch(query),items=all.filter(x=>Boolean(x.archived)===(scope.value==='Archived')&&normalizeSearch(x.title).includes(q)&&(tf.value==='Deleted'?x.deleted:!x.deleted&&(tf.value==='All'||(tf.value==='Completed')===x.completed))&&(pf.value==='All'||pf.value===x.priority)&&(!range.from&&!range.through||Boolean(x.due_date)&&(!range.from||x.due_date>=range.from)&&(!range.through||x.due_date<=range.through)));const order=document.getElementById('directory-order').value,rank={High:0,Normal:1,Low:2};if(order!=='Original')items.sort((a,b)=>order==='Priority'?rank[a.priority]-rank[b.priority]||a.originalIndex-b.originalIndex:order==='Due date'?(a.due_date?0:1)-(b.due_date?0:1)||(a.due_date||'').localeCompare(b.due_date||'')||a.originalIndex-b.originalIndex:(()=>{const x=Array.from(a.title.replace(/[A-Z]/g,c=>c.toLowerCase()),c=>c.codePointAt(0)),y=Array.from(b.title.replace(/[A-Z]/g,c=>c.toLowerCase()),c=>c.codePointAt(0));for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length})()||a.originalIndex-b.originalIndex);document.getElementById('directory-summary').textContent=items.filter(x=>x.completed).length+'/'+items.length+' completed';document.getElementById('directory-empty').hidden=items.length!==0;const activeLive=scope.value==='Active'&&tf.value!=='Deleted',open=items.some(x=>!x.completed&&!x.deleted),completed=items.some(x=>x.completed&&!x.deleted);document.getElementById('complete-visible').disabled=!activeLive||!open;document.getElementById('reopen-visible').disabled=!activeLive||!completed;document.getElementById('directory-results').innerHTML=items.map(x=>'<div class="row" data-testid="directory-task-row"><span data-testid="directory-task-title">'+escapeHtml(x.title)+'</span><span data-testid="directory-project-name">'+escapeHtml(x.name)+'</span><span data-testid="directory-task-completion">'+(x.completed?'Completed':'Open')+'</span><span data-testid="directory-task-priority">'+escapeHtml(x.priority)+'</span><span data-testid="directory-task-due-date">'+escapeHtml(x.due_date||'')+'</span><span data-testid="directory-task-notes">'+escapeHtml(x.notes||'')+'</span><button data-owner="'+x.project_id+'">Open project</button></div>').join('');document.querySelectorAll('[data-owner]').forEach(b=>b.onclick=()=>{history.pushState({},'','/projects/'+b.dataset.owner);render()})}document.getElementById('dsearchform').onsubmit=e=>{e.preventDefault();query=normalizeSearch(document.getElementById('dsearch').value.trim());draw()};all.forEach((item,index)=>item.originalIndex=index);[scope,tf,pf,document.getElementById('directory-order')].forEach(x=>x.onchange=draw);async function bulk(completed){const q=normalizeSearch(query);const ids=all.filter(x=>!x.archived&&!x.deleted&&(tf.value==='All'||(tf.value==='Completed')===Boolean(x.completed))&&(pf.value==='All'||pf.value===x.priority)&&normalizeSearch(x.title).includes(q)&&(!range.from&&!range.through||Boolean(x.due_date)&&(!range.from||x.due_date>=range.from)&&(!range.through||x.due_date<=range.through))&&(completed? !x.completed:x.completed)).map(x=>x.id);const response=await fetch('/api/directory/bulk',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({ids,completed})});if(!response.ok)return;const fresh=await(await fetch('/api/directory')).json();all.splice(0,all.length,...fresh);draw()}document.getElementById('complete-visible').onclick=()=>bulk(true);document.getElementById('reopen-visible').onclick=()=>bulk(false);document.getElementById('dapply').onclick=()=>{const f=document.getElementById('dfrom').value.trim(),t=document.getElementById('dthrough').value.trim(),valid=s=>!s||/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;if(!valid(f)||!valid(t)){document.getElementById('dalert').textContent='Due range must use valid YYYY-MM-DD dates';document.getElementById('dalert').hidden=false;return}if(f&&t&&f>t){document.getElementById('dalert').textContent='Due from must not be after Due through';document.getElementById('dalert').hidden=false;return}range={from:f,through:t};document.getElementById('dalert').hidden=true;draw()};draw();return}const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){history.replaceState({},'', '/');return render()}const p=await response.json();app.innerHTML='<button id="back">Projects</button><button id="download-project">Download project</button><h1>'+escapeHtml(p.name)+'</h1>'+(p.archived?'<p>Archived project</p>':'')+'<form id="rename"><input id="new-name" aria-label="New project name" value="'+escapeHtml(p.name)+'"'+(p.archived?' disabled':'')+'><button type="submit"'+(p.archived?' disabled':'')+'>Rename project</button></form><p class="alert" id="rename-alert" role="alert" hidden></p>'+'<label>Default task priority <select id="default-priority"'+(p.archived?' disabled':'')+'><option'+(p.default_priority==='Low'?' selected':'')+'>Low</option><option'+(p.default_priority==='Normal'?' selected':'')+'>Normal</option><option'+(p.default_priority==='High'?' selected':'')+'>High</option></select></label><form id="create-task"><input id="task-title" aria-label="Task title" placeholder="Task title"><button type="submit">Create task</button></form><p class="alert" id="task-alert" role="alert" hidden></p><label>Task filter <select id="task-filter"><option>All</option><option>Open</option><option>Completed</option><option>Deleted</option></select></label><label>Priority filter <select id="priority-filter"><option>All</option><option>Low</option><option>Normal</option><option>High</option></select></label><label>Due from <input id="due-from" aria-label="Due from"></label><label>Due through <input id="due-through" aria-label="Due through"></label><button id="apply-due-range">Apply due range</button><p class="alert" id="range-alert" role="alert" hidden></p><form id="task-search-form"><input id="task-search" aria-label="Task search"><button>Search tasks</button></form><section id="tasks"></section>';document.getElementById('back').onclick=()=>{history.pushState({},'','/');render()};document.getElementById('download-project').onclick=()=>{location.href='/api/projects/'+p.id+'/export'};if(!p.archived){document.getElementById('default-priority').onchange=async e=>{await fetch('/api/projects/'+p.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({default_priority:e.target.value})})};document.getElementById('rename').onsubmit=async e=>{e.preventDefault();const name=document.getElementById('new-name').value.trim(),alert=document.getElementById('rename-alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects/'+p.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok){document.querySelector('h1').textContent=name;document.getElementById('new-name').value=name}}}if(p.archived){document.querySelector('#create-task input').disabled=true;document.querySelector('#create-task button').disabled=true}const filter=document.getElementById('task-filter'),priorityFilter=document.getElementById('priority-filter');let appliedTaskQuery='';document.getElementById('task-search-form').onsubmit=e=>{e.preventDefault();appliedTaskQuery=normalizeSearch(document.getElementById('task-search').value.trim());loadTasks()};async function loadTasks(){const tasks=await(await fetch('/api/projects/'+p.id+'/tasks')).json(),destinations=(await(await fetch('/api/projects')).json()).filter(x=>!x.archived&&x.id!==p.id);const shown=tasks.filter(t=>normalizeSearch(t.title).includes(appliedTaskQuery)&&(filter.value==='Deleted'?Boolean(t.deleted):!t.deleted&&(filter.value==='All'||(filter.value==='Completed')===Boolean(t.completed)))&&(priorityFilter.value==='All'||priorityFilter.value===t.priority)&&(!appliedRange.from&&!appliedRange.through||Boolean(t.due_date)&&(!appliedRange.from||t.due_date>=appliedRange.from)&&(!appliedRange.through||t.due_date<=appliedRange.through)));document.getElementById('tasks').innerHTML=shown.map(t=>'<div class="row" data-testid="task-row"><span>'+escapeHtml(t.title)+'</span><label class="task-label"><input type="checkbox" aria-label="Complete '+escapeHtml(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+((p.archived||t.deleted)?' disabled':'')+'></label><input aria-label="New task title" data-rename-input="'+t.id+'" value="'+escapeHtml(t.title)+'"'+(p.archived?' disabled':'')+'><button data-rename="'+t.id+'"'+(p.archived?' disabled':'')+'>Rename task</button><select aria-label="Task priority" data-priority="'+t.id+'"'+(p.archived?' disabled':'')+'><option'+(t.priority==='Low'?' selected':'')+'>Low</option><option'+(t.priority==='Normal'?' selected':'')+'>Normal</option><option'+(t.priority==='High'?' selected':'')+'>High</option></select><input aria-label="Task due date" data-date="'+t.id+'" value="'+escapeHtml(t.due_date||'')+'"'+(p.archived?' disabled':'')+'><button data-save-date="'+t.id+'"'+(p.archived?' disabled':'')+'>Save due date</button><textarea aria-label="Task notes" data-notes="'+t.id+'"'+(p.archived?' disabled':'')+'>'+escapeHtml(t.notes||'')+'</textarea><button data-save-notes="'+t.id+'"'+(p.archived?' disabled':'')+'>Save notes</button>'+(t.deleted?'<button data-restore-task="'+t.id+'"'+(p.archived?' disabled':'')+'>Restore task</button>':'<button data-delete-task="'+t.id+'"'+(p.archived?' disabled':'')+'>Delete task</button>')+'<select aria-label="Destination project" data-destination="'+t.id+'"'+(p.archived||destinations.length===0?' disabled':'')+'>'+destinations.map(d=>'<option value="'+d.id+'">'+escapeHtml(d.name)+'</option>').join('')+'</select><button data-move="'+t.id+'"'+(p.archived||destinations.length===0?' disabled':'')+'>Move task</button></div>').join('');document.querySelectorAll('#tasks .row').forEach(row=>{if(row.querySelector('[data-restore-task]'))row.querySelectorAll('input,select,textarea,button').forEach(control=>{if(!control.matches('[data-restore-task]'))control.disabled=true})});document.querySelectorAll('#tasks [data-delete-task],#tasks [data-restore-task]').forEach(button=>button.onclick=async()=>{await fetch('/api/tasks/'+(button.dataset.deleteTask||button.dataset.restoreTask),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({deleted:!!button.dataset.deleteTask})});loadTasks()});document.querySelectorAll('#tasks input[type=checkbox]').forEach(box=>box.onchange=async()=>{await fetch('/api/tasks/'+box.dataset.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:box.checked})});loadTasks()});document.querySelectorAll('#tasks [data-priority]').forEach(select=>select.onchange=async()=>{await fetch('/api/tasks/'+select.dataset.priority,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({priority:select.value})});loadTasks()});document.querySelectorAll('#tasks [data-save-date]').forEach(button=>button.onclick=async()=>{const input=document.querySelector('[data-date="'+button.dataset.saveDate+'"]'),r=await fetch('/api/tasks/'+button.dataset.saveDate,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({due_date:input.value})});if(!r.ok){const message=document.getElementById('task-alert');message.textContent='Due date must be a valid YYYY-MM-DD date';message.hidden=false}else{document.getElementById('task-alert').hidden=true;loadTasks()}});document.querySelectorAll('#tasks [data-save-notes]').forEach(button=>button.onclick=async()=>{const notes=document.querySelector('[data-notes="'+button.dataset.saveNotes+'"]').value;const r=await fetch('/api/tasks/'+button.dataset.saveNotes,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({notes})});if(r.ok)loadTasks()});document.querySelectorAll('#tasks [data-move]').forEach(button=>button.onclick=async()=>{const select=document.querySelector('[data-destination="'+button.dataset.move+'"]');await fetch('/api/tasks/'+button.dataset.move,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({project_id:Number(select.value)})});loadTasks()});document.querySelectorAll('#tasks [data-rename]').forEach(button=>button.onclick=async()=>{const input=document.querySelector('[data-rename-input="'+button.dataset.rename+'"]'),title=input.value.trim();if(!title){const message=document.getElementById('task-alert');message.textContent='Task title is required';message.hidden=false;return}const r=await fetch('/api/tasks/'+button.dataset.rename,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title})});if(r.ok)loadTasks()})}let appliedRange={from:'',through:''};document.getElementById('apply-due-range').onclick=()=>{const from=document.getElementById('due-from').value.trim(),through=document.getElementById('due-through').value.trim(),alert=document.getElementById('range-alert'),valid=s=>{if(!s)return true;const m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s);if(!m)return false;const y=+m[1],mo=+m[2],d=+m[3],date=new Date(0);date.setUTCFullYear(y,mo-1,d);return y>=1&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d};if(!valid(from)||!valid(through)){alert.textContent='Due range must use valid YYYY-MM-DD dates';alert.hidden=false;return}if(from&&through&&from>through){alert.textContent='Due from must not be after Due through';alert.hidden=false;return}appliedRange={from,through};alert.hidden=true;loadTasks()};filter.onchange=loadTasks;priorityFilter.onchange=loadTasks;document.getElementById('create-task').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('task-title'),title=input.value.trim(),alert=document.getElementById('task-alert');if(!title){alert.textContent='Task title is required';alert.hidden=false;return}const r=await fetch('/api/projects/'+p.id+'/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});if(r.ok){input.value='';alert.hidden=true;loadTasks()}};loadTasks();return}
const projects=await(await fetch('/api/projects')).json();app.innerHTML='<h1>Workboard</h1><button id="open-directory">Task directory</button><label>Project filter <select id="project-filter"><option>Active</option><option>Archived</option></select></label><form id="project-search-form"><input id="project-search" aria-label="Project search"><button>Search projects</button></form><form id="create"><input id="name" aria-label="Project name" placeholder="Project name"><button type="submit">Create project</button></form><form id="import-project"><textarea id="project-json" aria-label="Project JSON"></textarea><input id="import-name" aria-label="Imported project name"><button>Import project</button></form><p class="alert" id="import-alert" role="alert" hidden></p><p class="alert" id="alert" role="alert" hidden></p><section id="projects"></section>';document.getElementById('open-directory').onclick=()=>{history.pushState({},'','/directory');render()};const list=document.getElementById('projects'),filter=document.getElementById('project-filter');let appliedProjectQuery='';document.getElementById('project-search-form').onsubmit=e=>{e.preventDefault();appliedProjectQuery=document.getElementById('project-search').value.trim();draw()};function draw(){const query=normalizeSearch(appliedProjectQuery);const shown=projects.filter(p=>Boolean(p.archived)===(filter.value==='Archived')&&normalizeSearch(p.name).includes(query));list.innerHTML=shown.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><span data-testid="project-summary">'+p.completed+'/'+p.total+' completed</span><button data-open="'+p.id+'">Open project</button>'+(p.archived?'<button data-restore="'+p.id+'">Restore project</button>':'<button data-archive="'+p.id+'">Archive project</button>')+'</div>').join('');list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{history.pushState({},'','/projects/'+b.dataset.open);render()});list.querySelectorAll('[data-archive],[data-restore]').forEach(b=>b.onclick=async()=>{await fetch('/api/projects/'+(b.dataset.archive||b.dataset.restore)+'/archive',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:!!b.dataset.archive})});render()})}filter.onchange=draw;draw();document.getElementById('import-project').onsubmit=async e=>{e.preventDefault();const json=document.getElementById('project-json').value,override=document.getElementById('import-name').value,alert=document.getElementById('import-alert');const r=await fetch('/api/projects/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({json, name:override})});if(r.ok){const result=await r.json();history.pushState({},'','/projects/'+result.id);render()}else{const body=await r.json();alert.textContent=body.error==='Project name is required'?'Project name is required':'Invalid project JSON';alert.hidden=false}};document.getElementById('create').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('name'),name=input.value.trim(),alert=document.getElementById('alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok)render()};}
addEventListener('popstate',render);render();
</script></main></body></html>`;

function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new Error('Request too large'); }
  return JSON.parse(body);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/directory') return send(res,200,db.prepare('SELECT t.id,t.project_id,t.title,t.completed,t.priority,t.due_date,t.notes,t.deleted,p.name,p.archived FROM tasks t JOIN projects p ON p.id=t.project_id ORDER BY p.id,t.position,t.id').all().map(x=>({...x,completed:Boolean(x.completed),deleted:Boolean(x.deleted),archived:Boolean(x.archived)})));
  if (req.method === 'PATCH' && url.pathname === '/api/directory/bulk') { try { const b=await readBody(req); if(!Array.isArray(b.ids)||typeof b.completed!=='boolean')return send(res,400,{error:'Invalid request'}); const update=db.prepare('UPDATE tasks SET completed=? WHERE id=? AND deleted=0 AND project_id IN (SELECT id FROM projects WHERE archived=0)'); db.exec('BEGIN'); try { for(const id of new Set(b.ids)) if(Number.isInteger(id)) update.run(b.completed?1:0,id); db.exec('COMMIT'); } catch(e){db.exec('ROLLBACK');throw e;} return send(res,200,{status:'ok'}); } catch { return send(res,400,{error:'Invalid request'}); } }
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, db.prepare('SELECT p.id,p.name,p.archived,COUNT(CASE WHEN t.deleted=0 THEN t.id END) total,COALESCE(SUM(CASE WHEN t.deleted=0 THEN t.completed ELSE 0 END),0) completed FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id').all());
  const exportItem = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (req.method === 'GET' && exportItem) {
    const id = Number(exportItem[1]);
    const project = db.prepare('SELECT id,name,archived,default_priority FROM projects WHERE id=?').get(id);
    if (!project) return send(res,404,{error:'Not found'});
    const tasks = db.prepare('SELECT title,completed,priority,due_date,notes,deleted FROM tasks WHERE project_id=? ORDER BY position,id').all(id).map(t => ({title:t.title,completed:Boolean(t.completed),priority:t.priority||'Normal',dueDate:t.due_date||'',notes:String(t.notes||'').replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n'),deleted:Boolean(t.deleted)}));
    res.writeHead(200, {'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="workboard-project.json"','cache-control':'no-store'});
    return res.end(JSON.stringify({format:'workboard-project',version:1,project:{name:project.name,archived:Boolean(project.archived),defaultPriority:project.default_priority||'Normal',tasks}}));
  }
  const projectItem = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  const projectTasks = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && projectItem) {
    const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?').get(Number(projectItem[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Not found' });
  }
  if (req.method === 'PATCH' && projectItem) {
    try {
      const body = await readBody(req);
      const project = db.prepare('SELECT archived FROM projects WHERE id = ?').get(Number(projectItem[1]));
      if (!project) return send(res, 404, { error: 'Not found' });
      if (project.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
      if (Object.hasOwn(body, 'default_priority')) {
        if (!['Low', 'Normal', 'High'].includes(body.default_priority)) return send(res, 400, { error: 'Invalid priority' });
        db.prepare('UPDATE projects SET default_priority=? WHERE id=?').run(body.default_priority, Number(projectItem[1]));
      } else {
        const name = String(body.name ?? '').trim();
        if (!name) return send(res, 400, { error: 'Project name is required' });
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, Number(projectItem[1]));
      }
      return send(res, 200, db.prepare('SELECT id, name, default_priority FROM projects WHERE id = ?').get(Number(projectItem[1])));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const archiveItem = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (req.method === 'PATCH' && archiveItem) {
    try { const archived=(await readBody(req)).archived; if(typeof archived!=='boolean') return send(res,400,{error:'Invalid state'}); const result=db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archived?1:0,Number(archiveItem[1])); return result.changes?send(res,200,{status:'ok'}):send(res,404,{error:'Not found'}); } catch { return send(res,400,{error:'Invalid request'}); }
  }
  if (req.method === 'GET' && projectTasks) {
    const id = Number(projectTasks[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(id)) return send(res, 404, { error: 'Not found' });
    return send(res, 200, db.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position,id').all(id));
  }
  if (req.method === 'POST' && projectTasks) {
    try {
      const projectId = Number(projectTasks[1]);
      const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, { error: 'Not found' });
      if (project.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
      const title = String((await readBody(req)).title ?? '').trim();
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, position) VALUES (?, ?, ?, COALESCE((SELECT MAX(position)+1 FROM tasks WHERE project_id=?),0))').run(projectId, title, project.default_priority, projectId);
      const taskId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO task_project_positions(task_id,project_id,position) SELECT ?,?,position FROM tasks WHERE id=?').run(taskId, projectId, taskId);
      return send(res, 201, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE id = ?').get(taskId));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskItem = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskItem) {
    try {
      const body = await readBody(req);
      if (Object.hasOwn(body, 'deleted')) {
        if(typeof body.deleted!=='boolean') return send(res,400,{error:'Invalid state'});
        const task=db.prepare('SELECT tasks.id,projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        if(!task) return send(res,404,{error:'Not found'});
        if(task.archived) return send(res,409,{error:'Archived projects cannot be changed'});
        db.prepare('UPDATE tasks SET deleted=? WHERE id=?').run(body.deleted?1:0,task.id);
        return send(res,200,{status:'ok'});
      }
      if (Object.hasOwn(body, 'project_id')) {
        const task=db.prepare('SELECT tasks.id,tasks.project_id,projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        const destination=db.prepare('SELECT id,archived FROM projects WHERE id=?').get(Number(body.project_id));
        if(!task) return send(res,404,{error:'Not found'});
        if(task.archived||!destination||destination.archived||destination.id===task.project_id) return send(res,400,{error:'Invalid destination'});
        let remembered=db.prepare('SELECT position FROM task_project_positions WHERE task_id=? AND project_id=?').get(task.id,destination.id);
        if(!remembered){
          const next=db.prepare('SELECT COALESCE(MAX(position)+1,0) position FROM task_project_positions WHERE project_id=?').get(destination.id).position;
          db.prepare('INSERT INTO task_project_positions(task_id,project_id,position) VALUES(?,?,?)').run(task.id,destination.id,next);
          remembered={position:next};
        }
        db.prepare('UPDATE tasks SET project_id=?,position=? WHERE id=?').run(destination.id,remembered.position,task.id);
        return send(res,200,{status:'ok'});
      }
      if (Object.hasOwn(body, 'notes')) {
        if (typeof body.notes !== 'string') return send(res, 400, { error: 'Invalid notes' });
        const task=db.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        if(!task) return send(res,404,{error:'Not found'});
        if(task.archived) return send(res,409,{error:'Archived projects cannot be changed'});
        db.prepare('UPDATE tasks SET notes=? WHERE id=?').run(body.notes,task.id);
        return send(res,200,{status:'ok'});
      }
      if (Object.hasOwn(body, 'due_date')) {
        const raw = String(body.due_date ?? '').trim();
        let dueDate = null;
        if (raw) {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
          if (!match) return send(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          const year=Number(match[1]), month=Number(match[2]), day=Number(match[3]);
          const date=new Date(0); date.setUTCFullYear(year, month-1, day);
          if(year<1||year>9999||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day) return send(res,400,{error:'Due date must be a valid YYYY-MM-DD date'});
          dueDate=raw;
        }
        const task=db.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        if(!task) return send(res,404,{error:'Not found'});
        if(task.archived) return send(res,409,{error:'Archived projects cannot be changed'});
        db.prepare('UPDATE tasks SET due_date=? WHERE id=?').run(dueDate,Number(taskItem[1]));
        return send(res,200,db.prepare('SELECT id,title,completed,priority,due_date FROM tasks WHERE id=?').get(Number(taskItem[1])));
      }
      if (Object.hasOwn(body, 'priority')) {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) return send(res, 400, { error: 'Invalid priority' });
        const task = db.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        if (!task) return send(res, 404, { error: 'Not found' });
        if (task.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
        db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(body.priority, Number(taskItem[1]));
        return send(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE id=?').get(Number(taskItem[1])));
      }
      if (Object.hasOwn(body, 'title')) {
        const title = String(body.title ?? '').trim();
        if (!title) return send(res, 400, { error: 'Task title is required' });
        const task = db.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
        if (!task) return send(res, 404, { error: 'Not found' });
        if (task.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
        db.prepare('UPDATE tasks SET title=? WHERE id=?').run(title, Number(taskItem[1]));
        return send(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE id=?').get(Number(taskItem[1])));
      }
      const completed = body.completed;
      if (typeof completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
      const task = db.prepare('SELECT tasks.id, projects.archived FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?').get(Number(taskItem[1]));
      if (!task) return send(res, 404, { error: 'Not found' });
      if (task.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskItem[1]));
      if (!result.changes) return send(res, 404, { error: 'Not found' });
      return send(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE id = ?').get(Number(taskItem[1])));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects/import') {
    let body;
    try { body=await readBody(req); } catch { return send(res,400,{error:'Invalid project JSON'}); }
    const name=String(body.name??'').trim();
    if(!name) return send(res,400,{error:'Project name is required'});
    let doc;
    try {
      doc=JSON.parse(body.json);
      const validDate=s=>{if(s==='')return true;if(typeof s!=='string')return false;const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)return false;const y=+m[1],mo=+m[2],d=+m[3],date=new Date(0);date.setUTCFullYear(y,mo-1,d);return y>=1&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d};
      if(!doc||doc.format!=='workboard-project'||doc.version!==1||!Number.isInteger(doc.version)||!doc.project||typeof doc.project!=='object')throw 0;
      const p=doc.project;if(typeof p.name!=='string'||!p.name.trim()||typeof p.archived!=='boolean'||!['Low','Normal','High'].includes(p.defaultPriority)||!Array.isArray(p.tasks))throw 0;
      for(const t of p.tasks)if(!t||typeof t.title!=='string'||!t.title.trim()||typeof t.completed!=='boolean'||!['Low','Normal','High'].includes(t.priority)||!validDate(t.dueDate)||typeof t.notes!=='string'||typeof t.deleted!=='boolean')throw 0;
    } catch { return send(res,400,{error:'Invalid project JSON'}); }
    const p=doc.project;
    const transaction=db.prepare('INSERT INTO projects (name,archived,default_priority) VALUES (?,?,?)');
    db.exec('BEGIN');
    try { const id=Number(transaction.run(name,p.archived?1:0,p.defaultPriority).lastInsertRowid);const ins=db.prepare('INSERT INTO tasks (project_id,title,completed,priority,due_date,notes,deleted,position) VALUES (?,?,?,?,?,?,?,?)');const pos=db.prepare('INSERT INTO task_project_positions(task_id,project_id,position) VALUES (?,?,?)');p.tasks.forEach((t,i)=>{const taskId=Number(ins.run(id,t.title,t.completed?1:0,t.priority,t.dueDate||null,t.notes.replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n'),t.deleted?1:0,i).lastInsertRowid);pos.run(taskId,id,i)});db.exec('COMMIT');return send(res,201,{id}); } catch { db.exec('ROLLBACK');return send(res,400,{error:'Invalid project JSON'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const name = String((await readBody(req)).name ?? '').trim();
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(result.lastInsertRowid)));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(res, 200, html, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
