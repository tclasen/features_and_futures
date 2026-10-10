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
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#18212b}h1{margin-bottom:1.5rem}form{display:flex;gap:.6rem;align-items:end}label{display:grid;gap:.35rem}input,button{font:inherit;padding:.55rem .75rem}button{cursor:pointer}.rows{list-style:none;padding:0;margin-top:1.5rem}.rows li{display:flex;justify-content:space-between;align-items:center;border:1px solid #ccd3da;border-radius:5px;padding:.8rem 1rem;margin:.5rem 0}.alert{color:#a21b1b;margin-top:1rem}</style></head>
<body><main id="app"></main><script>
const app=document.querySelector('#app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function showList(){
 app.innerHTML='<h1>Workboard</h1><form id="create"><label>Project name<input name="name" type="text" aria-label="Project name"></label><button type="submit">Create project</button></form><div id="alert" class="alert" role="alert" hidden></div><ul class="rows" id="projects"></ul>';
 const render=async()=>{const projects=await fetch('/api/projects').then(r=>r.json());document.querySelector('#projects').innerHTML=projects.map(p=>'<li data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><button type="button" data-id="'+p.id+'">Open project</button></li>').join('');};
 await render();
 document.querySelector('#create').addEventListener('submit',async event=>{event.preventDefault();const input=event.currentTarget.elements.name;const name=input.value.trim();const alert=document.querySelector('#alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return;}const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(response.ok){input.value='';alert.hidden=true;await render();}});
 document.querySelector('#projects').addEventListener('click',event=>{const button=event.target.closest('button[data-id]');if(button)location.href='/projects/'+button.dataset.id;});
}
async function showProject(id){const response=await fetch('/api/projects/'+encodeURIComponent(id));if(!response.ok){location.replace('/');return;}const project=await response.json();app.innerHTML='<button type="button" id="back">Projects</button><h1>'+escapeHtml(project.name)+'</h1><form id="create-task"><label>Task title<input name="title" type="text" aria-label="Task title"></label><button type="submit">Create task</button></form><div id="task-alert" class="alert" role="alert" hidden></div><label>Task filter<select id="task-filter" aria-label="Task filter"><option>All</option><option>Open</option><option>Completed</option></select></label><ul class="rows" id="tasks"></ul>';document.querySelector('#back').addEventListener('click',()=>location.href='/');const render=async()=>{const tasks=await fetch('/api/projects/'+id+'/tasks').then(r=>r.json());const filter=document.querySelector('#task-filter').value;document.querySelector('#tasks').innerHTML=tasks.filter(t=>filter==='All'||(filter==='Completed'?t.completed:!t.completed)).map(t=>'<li data-testid="task-row"><span>'+escapeHtml(t.title)+'</span><label><input type="checkbox" aria-label="Complete '+escapeHtml(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+'></label></li>').join('');};await render();document.querySelector('#task-filter').addEventListener('change',render);document.querySelector('#create-task').addEventListener('submit',async event=>{event.preventDefault();const input=event.currentTarget.elements.title;const title=input.value.trim();const alert=document.querySelector('#task-alert');if(!title){alert.textContent='Task title is required';alert.hidden=false;return;}const result=await fetch('/api/projects/'+id+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});if(result.ok){input.value='';alert.hidden=true;await render();}});document.querySelector('#tasks').addEventListener('change',async event=>{const box=event.target.closest('input[type=checkbox]');if(box){await fetch('/api/projects/'+id+'/tasks/'+box.dataset.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:box.checked})});await render();}});}
const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match)showProject(match[1]);else if(location.pathname==='/'||location.pathname==='')showList();else location.replace('/');
</script></body></html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, listProjects.all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = JSON.parse(body).name;
      if (typeof name !== 'string' || !name.trim()) return sendJson(res, 400, { error: 'Project name is required' });
      const result = addProject.run(name.trim());
      return sendJson(res, 201, findProject.get(Number(result.lastInsertRowid)));
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) return sendJson(res, 404, { error: 'Not found' });
    return sendJson(res, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const projectId = Number(tasksMatch[1]);
      const title = JSON.parse(body).title;
      if (!findProject.get(projectId)) return sendJson(res, 404, { error: 'Not found' });
      if (typeof title !== 'string' || !title.trim()) return sendJson(res, 400, { error: 'Task title is required' });
      const result = addTask.run(projectId, title.trim());
      const task = listTasks.all(projectId).find(item => item.id === Number(result.lastInsertRowid));
      return sendJson(res, 201, { ...task, completed: Boolean(task.completed) });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (taskMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { completed } = JSON.parse(body);
      if (typeof completed !== 'boolean') return sendJson(res, 400, { error: 'Invalid completion value' });
      const result = updateTask.run(completed ? 1 : 0, Number(taskMatch[2]), Number(taskMatch[1]));
      return result.changes ? sendJson(res, 200, { status: 'ok' }) : sendJson(res, 404, { error: 'Not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
server.listen(port, '0.0.0.0');
