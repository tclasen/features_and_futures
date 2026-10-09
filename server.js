import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#202b3c;font:16px system-ui,-apple-system,sans-serif}main{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:2rem;margin:0 0 28px}form,.project-row{background:white;border:1px solid #dce3ed;border-radius:10px;padding:20px;box-shadow:0 2px 8px #182c4710}form{display:flex;align-items:end;gap:12px;margin-bottom:24px}label{display:block;font-weight:600;margin-bottom:7px}input{width:100%;padding:11px 12px;border:1px solid #aebbc9;border-radius:6px;font:inherit}form>div{flex:1}button{border:0;background:#315fca;color:white;font:inherit;font-weight:600;padding:11px 16px;border-radius:6px;cursor:pointer}button:hover{background:#244da9}.project-row{display:flex;align-items:center;justify-content:space-between;margin:12px 0}.project-row h2{font-size:1.1rem;margin:0}.alert{color:#a32121;margin:0 0 14px}.back{margin-bottom:24px}@media(max-width:520px){main{margin:36px auto}form{align-items:stretch;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const app=document.querySelector('#app');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render(){
 const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
 if(match){
   const response=await fetch('/api/projects/'+match[1]);
   if(!response.ok){history.replaceState({},'', '/');return render()}
   const project=await response.json();
   const taskResponse=await fetch('/api/projects/'+match[1]+'/tasks');
   const tasks=await taskResponse.json();
   app.innerHTML='<button class="back" id="back">Projects</button><h1>'+esc(project.name)+'</h1><form id="create-task"><div><label for="task-title">Task title</label><input id="task-title" name="title" type="text" autocomplete="off"></div><button type="submit">Create task</button></form><div id="task-alert" role="alert" aria-live="polite"></div><div><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></div><section id="tasks"></section>';
   document.querySelector('#back').onclick=()=>{history.pushState({},'', '/');render()};
   const list=document.querySelector('#tasks');
   function showTasks(){list.replaceChildren();const filter=document.querySelector('#task-filter').value;for(const task of tasks){if(filter==='Open'&&task.completed||filter==='Completed'&&!task.completed)continue;const row=document.createElement('div');row.className='project-row';row.dataset.testid='task-row';row.innerHTML='<span>'+esc(task.title)+'</span><input type="checkbox" aria-label="'+esc('Complete '+task.title)+'" '+(task.completed?'checked':'')+'>';row.querySelector('input').onchange=async e=>{await fetch('/api/tasks/'+task.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:e.target.checked})});task.completed=e.target.checked?1:0;showTasks()};list.append(row)}}
   document.querySelector('#task-filter').onchange=showTasks;showTasks();
   document.querySelector('#create-task').onsubmit=async event=>{event.preventDefault();const input=document.querySelector('#task-title');const title=input.value.trim();if(!title){document.querySelector('#task-alert').innerHTML='<p class="alert">Task title is required</p>';return}const result=await fetch('/api/projects/'+match[1]+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});if(result.ok)render()}; return;
 }
 const response=await fetch('/api/projects'); const projects=await response.json();
 app.innerHTML='<h1>Workboard</h1><form id="create"><div><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"></div><button type="submit">Create project</button></form><div id="alert" role="alert" aria-live="polite"></div><section id="projects"></section>';
 const list=document.querySelector('#projects');
 for(const project of projects){const row=document.createElement('div');row.className='project-row';row.dataset.testid='project-row';row.innerHTML='<h2>'+esc(project.name)+'</h2><button type="button">Open project</button>';row.querySelector('button').onclick=()=>{history.pushState({},'', '/projects/'+project.id);render()};list.append(row)}
 document.querySelector('#create').onsubmit=async event=>{event.preventDefault();const input=document.querySelector('#project-name');const name=input.value.trim();if(!name){document.querySelector('#alert').innerHTML='<p class="alert">Project name is required</p>';return}await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});render()};
}
addEventListener('popstate',render);render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  return JSON.parse(text || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const name = String((await readBody(req)).name ?? '').trim();
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects(name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    return send(res, 200, db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(tasksMatch[1])));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const title = String((await readBody(req)).title ?? '').trim();
      if (!title) return send(res, 400, { error: 'Task title is required' });
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(tasksMatch[1]))) return send(res, 404, { error: 'Not found' });
      const result = db.prepare('INSERT INTO tasks(project_id, title) VALUES (?, ?)').run(Number(tasksMatch[1]), title);
      return send(res, 201, { id: Number(result.lastInsertRowid), projectId: Number(tasksMatch[1]), title, completed: 0 });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    try {
      const completed = (await readBody(req)).completed ? 1 : 0;
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed, Number(taskMatch[1]));
      return result.changes ? send(res, 200, { completed }) : send(res, 404, { error: 'Not found' });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
