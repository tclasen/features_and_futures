import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}

const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}h1{margin-bottom:1.5rem}form{display:flex;gap:.6rem;align-items:end;flex-wrap:wrap}label{display:grid;gap:.35rem}input,button,select{font:inherit;padding:.55rem .8rem}button{cursor:pointer}.rows{padding:0;list-style:none}.row{display:flex;justify-content:space-between;align-items:center;padding:.9rem 1rem;margin:.6rem 0;border:1px solid #ccd3df;border-radius:6px}.alert{color:#a21b1b;margin:.75rem 0}.task-label{display:flex;align-items:center;gap:.65rem}</style></head>
<body><main id="app" aria-live="polite"></main><script>
const app=document.querySelector('#app');
function element(tag,text,attrs={}){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el}
async function request(path,options){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options?.headers||{})}});if(!response.ok)throw new Error('Request failed');return response.json()}
function button(text,handler){const b=element('button',text,{type:'button'});b.addEventListener('click',handler);return b}
async function showProjects(push=true){if(push)history.pushState({},'', '/');app.replaceChildren();app.append(element('h1','Workboard'));const form=element('form');const label=element('label');label.append(element('span','Project name'));const input=element('input',undefined,{type:'text',name:'name'});label.append(input);form.append(label,element('button','Create project',{type:'submit'}));app.append(form);const alert=element('p',undefined,{class:'alert',role:'alert','aria-live':'assertive'});app.append(alert);form.addEventListener('submit',async event=>{event.preventDefault();try{await request('/api/projects',{method:'POST',body:JSON.stringify({name:input.value})});await showProjects()}catch{alert.textContent='Project name is required'}});const fl=element('label');fl.append(element('span','Project filter'));const filter=element('select',undefined,{'aria-label':'Project filter'});for(const v of ['Active','Archived'])filter.append(element('option',v,{value:v}));fl.append(filter);app.append(fl);const list=element('ul',undefined,{class:'rows'});app.append(list);async function populate(){list.replaceChildren();for(const p of await request('/api/projects?filter='+filter.value)){const row=element('li',undefined,{class:'row','data-testid':'project-row'});row.append(element('span',p.name),element('span',p.summary,{ 'data-testid':'project-summary'}),button('Open project',()=>showProject(p.id)));row.append(button(p.archived?'Restore project':'Archive project',async()=>{await request('/api/projects/'+p.id,{method:'PATCH',body:JSON.stringify({archived:!p.archived})});await populate()}));list.append(row)}}filter.addEventListener('change',populate);await populate()}
async function showProject(id,push=true){const project=await request('/api/projects/'+id);if(push)history.pushState({},'', '/projects/'+id);app.replaceChildren(element('h1',project.name),button('Projects',showProjects));if(project.archived)app.append(element('p','Archived project'));const form=element('form');const label=element('label');label.append(element('span','Task title'));const input=element('input',undefined,{type:'text',name:'title'});label.append(input);const createButton=element('button','Create task',{type:'submit'});if(project.archived)createButton.disabled=true;form.append(label,createButton);app.append(form);const alert=element('p',undefined,{class:'alert',role:'alert','aria-live':'assertive'});app.append(alert);const filterLabel=element('label');filterLabel.append(element('span','Task filter'));const filter=element('select');filter.setAttribute('aria-label','Task filter');for(const value of ['All','Open','Completed'])filter.append(element('option',value,{value}));filterLabel.append(filter);app.append(filterLabel);const list=element('ul',undefined,{class:'rows'});app.append(list);async function renderTasks(){list.replaceChildren();const tasks=await request('/api/projects/'+id+'/tasks?filter='+filter.value);for(const task of tasks){const row=element('li',undefined,{class:'row','data-testid':'task-row'});const taskLabel=element('label',undefined,{class:'task-label'});const checkbox=element('input',undefined,{type:'checkbox','aria-label':'Complete '+task.title});checkbox.checked=Boolean(task.completed);if(project.archived)checkbox.disabled=true;checkbox.addEventListener('change',async()=>{await request('/api/tasks/'+task.id,{method:'PATCH',body:JSON.stringify({completed:checkbox.checked})});await renderTasks()});taskLabel.append(checkbox,element('span',task.title));row.append(taskLabel);list.append(row)}}filter.addEventListener('change',renderTasks);form.addEventListener('submit',async event=>{event.preventDefault();try{await request('/api/projects/'+id+'/tasks',{method:'POST',body:JSON.stringify({title:input.value})});await showProject(id,false)}catch{alert.textContent='Task title is required'}});await renderTasks()}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)$/);if(match){try{await showProject(match[1],false)}catch{history.replaceState({},'', '/');await showProjects(false)}}else await showProjects(false)}
window.addEventListener('popstate',render);render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') { const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0; return send(res, 200, db.prepare('SELECT p.id,p.name,p.archived,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.completed=1)||\'/\'||(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id)||\' completed\' AS summary FROM projects p WHERE p.archived=? ORDER BY p.id').all(archived)); }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'PATCH' && projectMatch) { const data=await readJson(req); if(typeof data?.archived!=='boolean') return send(res,400,{error:'Invalid archive state'}); db.prepare('UPDATE projects SET archived=? WHERE id=?').run(data.archived?1:0,Number(projectMatch[1])); return send(res,200,{ok:true}); }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') {
      const filter = url.searchParams.get('filter');
      let sql = 'SELECT id, project_id, title, completed FROM tasks WHERE project_id = ?';
      if (filter === 'Open') sql += ' AND completed = 0';
      if (filter === 'Completed') sql += ' AND completed = 1';
      return send(res, 200, db.prepare(sql + ' ORDER BY id').all(projectId));
    }
    if (req.method === 'POST') {
      if (db.prepare('SELECT archived FROM projects WHERE id=?').get(projectId).archived) return send(res,400,{error:'Archived project'});
      const data = await readJson(req);
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
      return send(res, 201, { id: Number(result.lastInsertRowid), project_id: projectId, title, completed: 0 });
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const data = await readJson(req);
    if (typeof data?.completed !== 'boolean') return send(res, 400, { error: 'Invalid completion state' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE archived=0)').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) return send(res, 200, index, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
