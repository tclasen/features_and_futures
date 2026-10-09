import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);

const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id, project_id AS projectId FROM tasks WHERE id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workboard</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#f5f7fa;color:#172033}main{max-width:720px;margin:4rem auto;padding:2rem;background:white;border:1px solid #dce2eb;border-radius:12px}h1{margin-top:0}form{display:flex;gap:.75rem;align-items:end}label{display:block;font-weight:600;margin-bottom:.35rem}input{font:inherit;padding:.65rem .75rem;border:1px solid #9aa7b9;border-radius:6px;min-width:16rem}button{font:inherit;padding:.65rem 1rem;border:0;border-radius:6px;background:#2457c5;color:white;cursor:pointer}button:hover{background:#1945a5}.project-row{display:flex;align-items:center;justify-content:space-between;padding:1rem 0;border-bottom:1px solid #e2e7ef}.project-row span{font-weight:600}.alert{color:#a32121;margin:.75rem 0}#back{margin-bottom:1rem} @media(max-width:600px){main{margin:1rem;padding:1.25rem}form{align-items:stretch;flex-direction:column}input{min-width:0}}
</style></head><body><main id="app"><h1>Workboard</h1><form id="create-form"><div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div><button type="submit">Create project</button></form><p id="message" class="alert" role="alert" hidden></p><section id="project-list" aria-label="Projects"></section></main>
<script type="module">
const app=document.querySelector('#app');
const path=location.pathname;
if(path.startsWith('/projects/')){
  const id=path.slice('/projects/'.length);
  const response=await fetch('/api/projects/'+encodeURIComponent(id));
  const project=response.ok?await response.json():null;
  app.innerHTML='';
  const back=document.createElement('button'); back.id='back'; back.textContent='Projects'; back.addEventListener('click',()=>location.href='/'); app.append(back);
  const heading=document.createElement('h1'); heading.textContent=project?.name ?? 'Project not found'; app.append(heading);
  if(project){
    const form=document.createElement('form'); form.id='task-form';
    const field=document.createElement('div'); const label=document.createElement('label'); label.htmlFor='task-title'; label.textContent='Task title';
    const input=document.createElement('input'); input.id='task-title'; input.type='text'; field.append(label,input);
    const create=document.createElement('button'); create.type='submit'; create.textContent='Create task'; form.append(field,create); app.append(form);
    const message=document.createElement('p'); message.className='alert'; message.setAttribute('role','alert'); message.hidden=true; app.append(message);
    const filterWrap=document.createElement('div'); const filterLabel=document.createElement('label'); filterLabel.htmlFor='task-filter'; filterLabel.textContent='Task filter';
    const filter=document.createElement('select'); filter.id='task-filter'; for(const value of ['All','Open','Completed']){const option=document.createElement('option');option.textContent=value;option.value=value;filter.append(option)} filterWrap.append(filterLabel,filter); app.append(filterWrap);
    const tasks=document.createElement('section'); tasks.setAttribute('aria-label','Tasks'); app.append(tasks);
    async function refresh(){const response=await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks');const rows=await response.json();tasks.replaceChildren();for(const task of rows){if(filter.value==='Open'&&task.completed||filter.value==='Completed'&&!task.completed)continue;const row=document.createElement('div');row.className='project-row';row.dataset.testid='task-row';const title=document.createElement('span');title.textContent=task.title;const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!task.completed;checkbox.setAttribute('aria-label','Complete '+task.title);checkbox.addEventListener('change',async()=>{await fetch('/api/tasks/'+task.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:checkbox.checked})});await refresh()});row.append(title,checkbox);tasks.append(row)}}
    filter.addEventListener('change',refresh);
    form.addEventListener('submit',async event=>{event.preventDefault();const title=input.value.trim();if(!title){message.textContent='Task title is required';message.hidden=false;return}const response=await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});if(response.ok){input.value='';message.hidden=true;message.textContent='';await refresh()}});
    await refresh();
  }
}else{
  const form=document.querySelector('#create-form'), input=document.querySelector('#project-name'), msg=document.querySelector('#message'), list=document.querySelector('#project-list');
  async function refresh(){const response=await fetch('/api/projects');const projects=await response.json();list.replaceChildren();for(const project of projects){const row=document.createElement('div');row.className='project-row';row.dataset.testid='project-row';const name=document.createElement('span');name.textContent=project.name;const open=document.createElement('button');open.type='button';open.textContent='Open project';open.addEventListener('click',()=>location.href='/projects/'+project.id);row.append(name,open);list.append(row)}}
  form.addEventListener('submit',async event=>{event.preventDefault();const name=input.value.trim();if(!name){msg.textContent='Project name is required';msg.hidden=false;return}const response=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(response.ok){input.value='';msg.hidden=true;msg.textContent='';await refresh()}});
  refresh();
}
</script></body></html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, listProjects.all());
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (request.method === 'GET' && tasksMatch) {
    const project = getProject.get(Number(tasksMatch[1]));
    return project ? sendJson(response, 200, listTasks.all(project.id)) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'POST' && tasksMatch) {
    const project = getProject.get(Number(tasksMatch[1]));
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    let body = '';
    for await (const chunk of request) body += chunk;
    let title;
    try { title = JSON.parse(body).title; } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof title !== 'string' || !title.trim()) return sendJson(response, 400, { error: 'Task title is required' });
    const result = insertTask.run(project.id, title.trim());
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId: project.id, title: title.trim(), completed: 0 });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    let body = '';
    for await (const chunk of request) body += chunk;
    let completed;
    try { completed = JSON.parse(body).completed; } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof completed !== 'boolean') return sendJson(response, 400, { error: 'Invalid completion state' });
    const task = getTask.get(Number(taskMatch[1]));
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    updateTask.run(completed ? 1 : 0, task.id);
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(response, 400, { error: 'Invalid request' }); }
    if (typeof name !== 'string' || !name.trim()) return sendJson(response, 400, { error: 'Project name is required' });
    const result = insertProject.run(name.trim());
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name: name.trim() });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
