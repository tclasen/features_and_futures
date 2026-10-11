import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const findProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listTasks = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id, title, completed FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total_count,
  COALESCE(SUM(t.completed), 0) AS completed_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id
  WHERE p.archived=? GROUP BY p.id ORDER BY p.id`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#1d2939;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:32px;line-height:1.2;margin:0 0 28px}.form{display:flex;gap:12px;margin-bottom:20px}label{display:block;font-weight:600;margin-bottom:7px}input{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;background:white}button{border:0;border-radius:6px;background:#2563eb;color:white;padding:11px 16px;font:600 15px inherit;cursor:pointer;white-space:nowrap}button:hover{background:#1d4ed8}.field{flex:1}.rows{display:grid;gap:10px}.row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:white;border:1px solid #e2e8f0;border-radius:8px}.alert{color:#b42318;margin:0 0 14px}.back{margin-bottom:22px}.empty{color:#667085}
</style></head><body><main class="shell" id="app"></main><script>
const app=document.getElementById('app');
function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function render(){
 const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
 if(match){
  const response=await fetch('/api/projects/'+match[1]);
  if(!response.ok){history.replaceState({},'', '/');return render()}
  const project=await response.json();
  const tasks=await fetch('/api/projects/'+match[1]+'/tasks').then(r=>r.json());
  app.innerHTML='<button class="back" id="back">Projects</button><h1>'+escapeText(project.name)+'</h1>'+(project.archived?'<p>Archived project</p>':'')+'<form id="task-form"><div class="form"><div class="field"><label for="task-title">Task title</label><input id="task-title" type="text" autocomplete="off" '+(project.archived?'disabled':'')+'></div><button type="submit" '+(project.archived?'disabled':'')+'>Create task</button></div><p class="alert" id="alert" role="alert" hidden></p></form><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><div class="rows" id="tasks"></div>';
  document.title=project.name+' - Workboard';
  document.getElementById('back').onclick=()=>{history.pushState({},'','/');render()};
  const draw=()=>{const filter=document.getElementById('task-filter').value;const shown=tasks.filter(t=>filter==='All'||(filter==='Completed')===!!t.completed);const rows=document.getElementById('tasks');rows.innerHTML='';if(!shown.length)rows.innerHTML='<p class="empty">No tasks yet.</p>';for(const task of shown){const row=document.createElement('div');row.className='row';row.dataset.testid='task-row';row.innerHTML='<span>'+escapeText(task.title)+'</span><input type="checkbox" aria-label="Complete '+escapeText(task.title)+'" '+(task.completed?'checked':'')+(project.archived?' disabled':'')+'>';row.querySelector('input').onchange=async e=>{await fetch('/api/projects/'+match[1]+'/tasks/'+task.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:e.target.checked})});task.completed=e.target.checked;draw()};rows.append(row)}};
  document.getElementById('task-filter').onchange=draw;draw();
  document.getElementById('task-form').onsubmit=async event=>{event.preventDefault();const input=document.getElementById('task-title'),title=input.value.trim(),alert=document.getElementById('alert');if(!title){alert.textContent='Task title is required';alert.hidden=false;return}const created=await fetch('/api/projects/'+match[1]+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}).then(r=>r.json());tasks.push(created);input.value='';alert.hidden=true;draw()};return;
 }
 document.title='Workboard';
 const filter=new URLSearchParams(location.search).get('filter')==='Archived'?'Archived':'Active';
 const projects=await fetch('/api/projects?filter='+filter).then(r=>r.json());
 app.innerHTML='<h1>Workboard</h1><label for="project-filter">Project filter</label><select id="project-filter"><option'+(filter==='Active'?' selected':'')+'>Active</option><option'+(filter==='Archived'?' selected':'')+'>Archived</option></select><form id="create-form"><div class="form"><div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"></div><button type="submit">Create project</button></div><p class="alert" id="alert" role="alert" hidden></p></form><div class="rows" id="projects"></div>';
 const rows=document.getElementById('projects');
 if(!projects.length) rows.innerHTML='<p class="empty">No projects yet.</p>';
 for(const project of projects){const row=document.createElement('div');row.className='row';row.dataset.testid='project-row';row.innerHTML='<span>'+escapeText(project.name)+' <span data-testid="project-summary">'+project.completed_count+'/'+project.total_count+' completed</span></span><span><button type="button" class="open">Open project</button> <button type="button" class="archive">'+(project.archived?'Restore project':'Archive project')+'</button></span>';row.querySelector('.open').onclick=()=>{history.pushState({},'', '/projects/'+project.id);render()};row.querySelector('.archive').onclick=async()=>{await fetch('/api/projects/'+project.id+'/archive',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!project.archived})});render()};rows.append(row)}
 document.getElementById('project-filter').onchange=e=>{history.pushState({},'','/?filter='+e.target.value);render()};
 document.getElementById('create-form').onsubmit=async event=>{event.preventDefault();const input=document.getElementById('project-name');const name=input.value.trim();const alert=document.getElementById('alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});render()};
}
window.addEventListener('popstate',render);render();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ status: 'ok' }));
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all(url.searchParams.get('filter')==='Archived'?1:0)));
  const archiveMatch=url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if(req.method==='PATCH'&&archiveMatch){try{let raw='';for await(const chunk of req)raw+=chunk;const id=Number(archiveMatch[1]);if(!findProject.get(id))return send(404,JSON.stringify({error:'Not found'}));setArchived.run(JSON.parse(raw).archived?1:0,id);return send(200,JSON.stringify(findProject.get(id)))}catch{return send(400,JSON.stringify({error:'Invalid request'}))}}
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (req.method === 'GET' && !tasksMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !tasksMatch[2]) {
      if(findProject.get(projectId).archived)return send(403,JSON.stringify({error:'Archived project'}));
      try { let raw=''; for await (const chunk of req) raw+=chunk; const title=String(JSON.parse(raw).title ?? '').trim(); if(!title)return send(400,JSON.stringify({error:'Task title is required'})); const result=createTask.run(projectId,title); return send(201,JSON.stringify(findTask.get(Number(result.lastInsertRowid),projectId))); } catch { return send(400,JSON.stringify({error:'Invalid request'})); }
    }
    if (req.method === 'PATCH' && tasksMatch[2]) {
      if(findProject.get(projectId).archived)return send(403,JSON.stringify({error:'Archived project'}));
      try { let raw=''; for await (const chunk of req) raw+=chunk; const completed=!!JSON.parse(raw).completed; const id=Number(tasksMatch[2]); if(!findTask.get(id,projectId))return send(404,JSON.stringify({error:'Not found'})); updateTask.run(completed?1:0,id,projectId); return send(200,JSON.stringify(findTask.get(id,projectId))); } catch { return send(400,JSON.stringify({error:'Invalid request'})); }
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? send(200, JSON.stringify(project)) : send(404, JSON.stringify({ error: 'Not found' }));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of req) raw += chunk;
      const name = String(JSON.parse(raw).name ?? '').trim();
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = createProject.run(name);
      return send(201, JSON.stringify(findProject.get(Number(result.lastInsertRowid))));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(200, page, 'text/html; charset=utf-8');
  }
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
