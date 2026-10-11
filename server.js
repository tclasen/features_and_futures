import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
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
  app.innerHTML='<button class="back" id="back">Projects</button><h1>'+escapeText(project.name)+'</h1><form id="task-form"><div class="form"><div class="field"><label for="task-title">Task title</label><input id="task-title" type="text" autocomplete="off"></div><button type="submit">Create task</button></div><p class="alert" id="alert" role="alert" hidden></p></form><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><div class="rows" id="tasks"></div>';
  document.title=project.name+' - Workboard';
  document.getElementById('back').onclick=()=>{history.pushState({},'','/');render()};
  const draw=()=>{const filter=document.getElementById('task-filter').value;const shown=tasks.filter(t=>filter==='All'||(filter==='Completed')===!!t.completed);const rows=document.getElementById('tasks');rows.innerHTML='';if(!shown.length)rows.innerHTML='<p class="empty">No tasks yet.</p>';for(const task of shown){const row=document.createElement('div');row.className='row';row.dataset.testid='task-row';row.innerHTML='<span>'+escapeText(task.title)+'</span><input type="checkbox" aria-label="Complete '+escapeText(task.title)+'" '+(task.completed?'checked':'')+'>';row.querySelector('input').onchange=async e=>{await fetch('/api/projects/'+match[1]+'/tasks/'+task.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:e.target.checked})});task.completed=e.target.checked;draw()};rows.append(row)}};
  document.getElementById('task-filter').onchange=draw;draw();
  document.getElementById('task-form').onsubmit=async event=>{event.preventDefault();const input=document.getElementById('task-title'),title=input.value.trim(),alert=document.getElementById('alert');if(!title){alert.textContent='Task title is required';alert.hidden=false;return}const created=await fetch('/api/projects/'+match[1]+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}).then(r=>r.json());tasks.push(created);input.value='';alert.hidden=true;draw()};return;
 }
 document.title='Workboard';
 const projects=await fetch('/api/projects').then(r=>r.json());
 app.innerHTML='<h1>Workboard</h1><form id="create-form"><div class="form"><div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"></div><button type="submit">Create project</button></div><p class="alert" id="alert" role="alert" hidden></p></form><div class="rows" id="projects"></div>';
 const rows=document.getElementById('projects');
 if(!projects.length) rows.innerHTML='<p class="empty">No projects yet.</p>';
 for(const project of projects){const row=document.createElement('div');row.className='row';row.dataset.testid='project-row';row.innerHTML='<span>'+escapeText(project.name)+'</span><button type="button">Open project</button>';row.querySelector('button').onclick=()=>{history.pushState({},'', '/projects/'+project.id);render()};rows.append(row)}
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
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(200, JSON.stringify(listProjects.all()));
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return send(404, JSON.stringify({ error: 'Not found' }));
    if (req.method === 'GET' && !tasksMatch[2]) return send(200, JSON.stringify(listTasks.all(projectId)));
    if (req.method === 'POST' && !tasksMatch[2]) {
      try { let raw=''; for await (const chunk of req) raw+=chunk; const title=String(JSON.parse(raw).title ?? '').trim(); if(!title)return send(400,JSON.stringify({error:'Task title is required'})); const result=createTask.run(projectId,title); return send(201,JSON.stringify(findTask.get(Number(result.lastInsertRowid),projectId))); } catch { return send(400,JSON.stringify({error:'Invalid request'})); }
    }
    if (req.method === 'PATCH' && tasksMatch[2]) {
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
