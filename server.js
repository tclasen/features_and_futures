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

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:#fff;border-bottom:1px solid #e1e6ef;padding:18px max(24px,calc((100% - 900px)/2));font-size:20px;font-weight:700}.container{max-width:900px;margin:48px auto;padding:0 24px}h1{font-size:32px;margin:0 0 24px}form{display:flex;gap:12px;max-width:600px;margin-bottom:24px}input,select{border:1px solid #b9c3d2;border-radius:6px;padding:11px 12px;font:inherit}input{flex:1;min-width:0}button{border:0;border-radius:6px;background:#265bd5;color:white;padding:11px 16px;font:600 15px inherit;cursor:pointer}button:hover{background:#1949b7}.row{background:white;border:1px solid #e1e6ef;border-radius:8px;padding:16px;margin:10px 0;display:flex;align-items:center;justify-content:space-between}.row button{padding:8px 14px}.alert{color:#a32626;margin:0 0 14px}[hidden]{display:none}.task-label{display:flex;align-items:center;gap:12px}.task-label input{flex:initial}
</style></head><body><header>Workboard</header><main class="container" id="app"></main>
<script>
const app=document.getElementById('app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){history.replaceState({},'', '/');return render()}const p=await response.json();app.innerHTML='<button id="back">Projects</button><h1>'+escapeHtml(p.name)+'</h1>'+(p.archived?'<p>Archived project</p>':'')+'<form id="rename"><input id="new-name" aria-label="New project name" value="'+escapeHtml(p.name)+'"'+(p.archived?' disabled':'')+'><button type="submit"'+(p.archived?' disabled':'')+'>Rename project</button></form><p class="alert" id="rename-alert" role="alert" hidden></p>'+'<label>Default task priority <select id="default-priority"'+(p.archived?' disabled':'')+'><option'+(p.default_priority==='Low'?' selected':'')+'>Low</option><option'+(p.default_priority==='Normal'?' selected':'')+'>Normal</option><option'+(p.default_priority==='High'?' selected':'')+'>High</option></select></label><form id="create-task"><input id="task-title" aria-label="Task title" placeholder="Task title"><button type="submit">Create task</button></form><p class="alert" id="task-alert" role="alert" hidden></p><label>Task filter <select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></label><label>Priority filter <select id="priority-filter"><option>All</option><option>Low</option><option>Normal</option><option>High</option></select></label><section id="tasks"></section>';document.getElementById('back').onclick=()=>{history.pushState({},'','/');render()};if(!p.archived){document.getElementById('default-priority').onchange=async e=>{await fetch('/api/projects/'+p.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({default_priority:e.target.value})})};document.getElementById('rename').onsubmit=async e=>{e.preventDefault();const name=document.getElementById('new-name').value.trim(),alert=document.getElementById('rename-alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects/'+p.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok)render()}}if(p.archived){document.querySelector('#create-task input').disabled=true;document.querySelector('#create-task button').disabled=true}const filter=document.getElementById('task-filter'),priorityFilter=document.getElementById('priority-filter');async function loadTasks(){const tasks=await(await fetch('/api/projects/'+p.id+'/tasks')).json();const shown=tasks.filter(t=>(filter.value==='All'||(filter.value==='Completed')===Boolean(t.completed))&&(priorityFilter.value==='All'||priorityFilter.value===t.priority));document.getElementById('tasks').innerHTML=shown.map(t=>'<div class="row" data-testid="task-row"><span>'+escapeHtml(t.title)+'</span><label class="task-label"><input type="checkbox" aria-label="Complete '+escapeHtml(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+(p.archived?' disabled':'')+'></label><input aria-label="New task title" data-rename-input="'+t.id+'" value="'+escapeHtml(t.title)+'"'+(p.archived?' disabled':'')+'><button data-rename="'+t.id+'"'+(p.archived?' disabled':'')+'>Rename task</button><select aria-label="Task priority" data-priority="'+t.id+'"'+(p.archived?' disabled':'')+'><option'+(t.priority==='Low'?' selected':'')+'>Low</option><option'+(t.priority==='Normal'?' selected':'')+'>Normal</option><option'+(t.priority==='High'?' selected':'')+'>High</option></select></div>').join('');document.querySelectorAll('#tasks input[type=checkbox]').forEach(box=>box.onchange=async()=>{await fetch('/api/tasks/'+box.dataset.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:box.checked})});loadTasks()});document.querySelectorAll('#tasks [data-priority]').forEach(select=>select.onchange=async()=>{await fetch('/api/tasks/'+select.dataset.priority,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({priority:select.value})});loadTasks()});document.querySelectorAll('#tasks [data-rename]').forEach(button=>button.onclick=async()=>{const input=document.querySelector('[data-rename-input="'+button.dataset.rename+'"]'),title=input.value.trim();if(!title){const message=document.getElementById('task-alert');message.textContent='Task title is required';message.hidden=false;return}const r=await fetch('/api/tasks/'+button.dataset.rename,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title})});if(r.ok)loadTasks()})}filter.onchange=loadTasks;priorityFilter.onchange=loadTasks;document.getElementById('create-task').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('task-title'),title=input.value.trim(),alert=document.getElementById('task-alert');if(!title){alert.textContent='Task title is required';alert.hidden=false;return}const r=await fetch('/api/projects/'+p.id+'/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});if(r.ok){input.value='';alert.hidden=true;loadTasks()}};loadTasks();return}
const projects=await(await fetch('/api/projects')).json();app.innerHTML='<h1>Workboard</h1><label>Project filter <select id="project-filter"><option>Active</option><option>Archived</option></select></label><form id="create"><input id="name" aria-label="Project name" placeholder="Project name"><button type="submit">Create project</button></form><p class="alert" id="alert" role="alert" hidden></p><section id="projects"></section>';const list=document.getElementById('projects'),filter=document.getElementById('project-filter');function draw(){const shown=projects.filter(p=>Boolean(p.archived)===(filter.value==='Archived'));list.innerHTML=shown.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><span data-testid="project-summary">'+p.completed+'/'+p.total+' completed</span><button data-open="'+p.id+'">Open project</button>'+(p.archived?'<button data-restore="'+p.id+'">Restore project</button>':'<button data-archive="'+p.id+'">Archive project</button>')+'</div>').join('');list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{history.pushState({},'','/projects/'+b.dataset.open);render()});list.querySelectorAll('[data-archive],[data-restore]').forEach(b=>b.onclick=async()=>{await fetch('/api/projects/'+(b.dataset.archive||b.dataset.restore)+'/archive',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:!!b.dataset.archive})});render()})}filter.onchange=draw;draw();document.getElementById('create').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('name'),name=input.value.trim(),alert=document.getElementById('alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok)render()};}
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
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, db.prepare('SELECT p.id,p.name,p.archived,COUNT(t.id) total,COALESCE(SUM(t.completed),0) completed FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id').all());
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
    return send(res, 200, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id').all(id));
  }
  if (req.method === 'POST' && projectTasks) {
    try {
      const projectId = Number(projectTasks[1]);
      const project = db.prepare('SELECT id, archived, default_priority FROM projects WHERE id = ?').get(projectId);
      if (!project) return send(res, 404, { error: 'Not found' });
      if (project.archived) return send(res, 409, { error: 'Archived projects cannot be changed' });
      const title = String((await readBody(req)).title ?? '').trim();
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)').run(projectId, title, project.default_priority);
      return send(res, 201, db.prepare('SELECT id, title, completed, priority FROM tasks WHERE id = ?').get(Number(result.lastInsertRowid)));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskItem = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskItem) {
    try {
      const body = await readBody(req);
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
