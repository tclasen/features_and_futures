import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error).includes('duplicate column name')) throw error; }

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:56px auto;padding:0 24px}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:22px;background:white;border:1px solid #e0e5ef;border-radius:10px}label{display:block;font-weight:600;margin-bottom:6px}input{width:100%;padding:10px 12px;border:1px solid #bac4d4;border-radius:6px;font:inherit}button{padding:10px 16px;border:0;border-radius:6px;background:#315fce;color:white;font:600 1rem inherit;cursor:pointer;white-space:nowrap}button:hover{background:#254ca8}.field{flex:1}#alert{color:#a32121;margin:12px 0 0}.rows{display:grid;gap:10px;margin-top:24px}.row{display:flex;justify-content:space-between;align-items:center;background:white;border:1px solid #e0e5ef;border-radius:8px;padding:14px 16px}.name{font-weight:600}.back{margin-bottom:20px} @media(max-width:520px){.wrap{margin:32px auto}form{align-items:stretch;flex-direction:column}}
</style></head><body><main class="wrap" id="app"></main><script>
const app=document.querySelector('#app');
function button(text,handler,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.addEventListener('click',handler);return b}
async function projects(){const r=await fetch('/api/projects');if(!r.ok)throw Error('Could not load projects');return r.json()}
async function render(){const match=location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);app.replaceChildren();if(match){const id=decodeURIComponent(match[1]);const r=await fetch('/api/projects/'+encodeURIComponent(id));if(!r.ok){app.innerHTML='<h1>Project not found</h1>';app.append(button('Projects',()=>navigate('/')));return}const p=await r.json();app.append(button('Projects',()=>navigate('/'),'back'));const h=document.createElement('h1');h.textContent=p.name;app.append(h);if(p.archived){const archived=document.createElement('p');archived.textContent='Archived project';app.append(archived)}const form=document.createElement('form');const field=document.createElement('div');field.className='field';const label=document.createElement('label');label.htmlFor='task-title';label.textContent='Task title';const input=document.createElement('input');input.id='task-title';input.type='text';field.append(label,input);const submit=document.createElement('button');submit.type='submit';submit.textContent='Create task';submit.disabled=!!p.archived;form.append(field,submit);app.append(form);const alert=document.createElement('p');alert.id='alert';alert.setAttribute('role','alert');alert.hidden=true;app.append(alert);const filterLabel=document.createElement('label');filterLabel.htmlFor='task-filter';filterLabel.textContent='Task filter';const filter=document.createElement('select');filter.id='task-filter';filter.setAttribute('aria-label','Task filter');for(const value of ['All','Open','Completed']){const option=document.createElement('option');option.textContent=value;option.value=value;filter.append(option)}app.append(filterLabel,filter);const list=document.createElement('div');list.className='rows';app.append(list);async function loadTasks(){list.replaceChildren();const tasks=await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks').then(x=>x.json());for(const task of tasks){if(filter.value==='Open'&&task.completed||filter.value==='Completed'&&!task.completed)continue;const row=document.createElement('div');row.className='row';row.dataset.testid='task-row';const title=document.createElement('span');title.className='name';title.textContent=task.title;const check=document.createElement('input');check.type='checkbox';check.checked=!!task.completed;check.disabled=!!p.archived;check.setAttribute('aria-label','Complete '+task.title);check.addEventListener('change',async()=>{await fetch('/api/tasks/'+encodeURIComponent(task.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:check.checked})});await loadTasks()});row.append(title,check);list.append(row)}}filter.addEventListener('change',loadTasks);form.addEventListener('submit',async e=>{e.preventDefault();const title=input.value.trim();if(!title){alert.textContent='Task title is required';alert.hidden=false;return}await fetch('/api/projects/'+encodeURIComponent(id)+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});input.value='';alert.hidden=true;await loadTasks()});await loadTasks();return}
const heading=document.createElement('h1');heading.textContent='Workboard';app.append(heading);const form=document.createElement('form');form.setAttribute('aria-label','Create project form');const field=document.createElement('div');field.className='field';const label=document.createElement('label');label.htmlFor='project-name';label.textContent='Project name';const input=document.createElement('input');input.id='project-name';input.name='name';input.type='text';input.autocomplete='off';field.append(label,input);const submit=document.createElement('button');submit.type='submit';submit.textContent='Create project';form.append(field,submit);app.append(form);const alert=document.createElement('p');alert.id='alert';alert.setAttribute('role','alert');alert.hidden=true;app.append(alert);const filterLabel=document.createElement('label');filterLabel.htmlFor='project-filter';filterLabel.textContent='Project filter';const filter=document.createElement('select');filter.id='project-filter';filter.setAttribute('aria-label','Project filter');for(const value of ['Active','Archived']){const option=document.createElement('option');option.value=value;option.textContent=value;filter.append(option)}app.append(filterLabel,filter);const list=document.createElement('div');list.className='rows';list.setAttribute('aria-label','Projects');app.append(list);filter.addEventListener('change',()=>loadRows(list,filter.value));form.addEventListener('submit',async e=>{e.preventDefault();const name=input.value.trim();if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(!r.ok)return;input.value='';alert.hidden=true;await loadRows(list,filter.value)});await loadRows(list,filter.value)}
async function loadRows(list,status='Active'){list.replaceChildren();for(const p of await projects()){if((status==='Archived')!==p.archived)continue;const row=document.createElement('div');row.className='row';row.dataset.testid='project-row';const name=document.createElement('span');name.className='name';name.textContent=p.name;const summary=document.createElement('span');summary.dataset.testid='project-summary';summary.textContent=p.completed+'/'+p.total+' completed';row.append(name,summary,button('Open project',()=>navigate('/projects/'+encodeURIComponent(p.id))),button(p.archived?'Restore project':'Archive project',async()=>{await fetch('/api/projects/'+encodeURIComponent(p.id)+'/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!p.archived})});await loadRows(list,status)}));list.append(row)}}
function navigate(path){history.pushState({},'',path);render()}window.addEventListener('popstate',render);render().catch(()=>{app.textContent='Unable to load Workboard'})
</script></body></html>`;

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT p.id, p.name, p.archived, COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id ORDER BY p.created_at, p.rowid').all().map(p => ({ ...p, archived: !!p.archived })));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
    return send(res, 201, project);
  }
  const taskCollection = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (taskCollection) {
    const projectId = decodeURIComponent(taskCollection[1]);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    if (req.method === 'GET') return send(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY created_at, rowid').all(projectId).map(t => ({ ...t, completed: !!t.completed })));
    if (req.method === 'POST') {
      const data = await readJson(req);
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title) return send(res, 400, { error: 'Task title is required' });
      const task = { id: randomUUID(), title, completed: false };
      db.prepare('INSERT INTO tasks (id, project_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(task.id, projectId, title, Date.now());
      return send(res, 201, task);
    }
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (req.method === 'POST' && archiveMatch) {
    const data = await readJson(req);
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(data?.archived ? 1 : 0, decodeURIComponent(archiveMatch[1]));
    return result.changes ? send(res, 200, { status: 'ok' }) : send(res, 404, { error: 'Project not found' });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const data = await readJson(req);
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data?.completed ? 1 : 0, decodeURIComponent(taskMatch[1]));
    return result.changes ? send(res, 200, { status: 'ok' }) : send(res, 404, { error: 'Task not found' });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(decodeURIComponent(projectMatch[1]));
    if (project) project.archived = !!project.archived;
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
