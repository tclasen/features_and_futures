import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const configuredDbPath = process.env.DB_PATH;
// DB_PATH is interpreted from the launch directory, as are relative paths in
// the shared start contract. The default remains stable for launches from the
// repository root.
const dbPath = resolve(configuredDbPath || join(process.cwd(), 'data', 'workboard.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
// WAL keeps committed writes recoverable if the process is restarted while
// SQLite still has recent changes in its write-ahead log.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = FULL');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

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
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#182235;font:16px/1.5 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:64px auto}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:20px;background:#fff;border:1px solid #e1e6ef;border-radius:12px;margin-top:18px}label{display:grid;gap:6px;flex:1;font-weight:600}input,select{font:inherit;border:1px solid #aeb9ca;border-radius:7px;padding:10px 12px;min-width:0}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:7px;background:#2459c4;color:white;cursor:pointer}button:disabled,input:disabled{opacity:.55;cursor:not-allowed}.back{background:transparent;color:#2459c4;padding:0;margin-bottom:20px}.rows{display:grid;gap:10px;margin-top:20px}.row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:white;border:1px solid #e1e6ef;border-radius:10px;padding:14px 16px}.name{overflow-wrap:anywhere}.alert{color:#a12424;margin:12px 0 0}.empty{color:#5d6879;margin-top:20px}.task-name{display:flex;align-items:center;gap:12px;flex:1}.task-name input{width:20px;height:20px}.summary{color:#5d6879;white-space:nowrap}.actions{display:flex;gap:8px;flex-wrap:wrap}.secondary{background:#586579}.archived{color:#8b4b00;background:#fff2d8;padding:8px 12px;border-radius:7px}@media(max-width:520px){form,.row{align-items:stretch;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const root=document.querySelector('#app');function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}async function req(url,opt){const r=await fetch(url,opt);if(!r.ok)throw Error();return r.json()}function projectId(){return(location.pathname.match(/^\/projects\/(\d+)\/?$/)||[])[1]}
async function render(){const id=projectId();if(id){let p;try{p=await req('/api/projects/'+id)}catch{}if(!p){root.innerHTML='<h1>Project not found</h1><button id="back">Projects</button>';document.querySelector('#back').onclick=()=>location.assign('/');return}root.innerHTML='<button class="back" id="back">Projects</button><h1>'+esc(p.name)+'</h1>'+(p.archived?'<p class="archived">Archived project</p>':'')+'<form id="create-task"><label for="task-title">Task title</label><input id="task-title" '+(p.archived?'disabled':'')+'><button '+(p.archived?'disabled':'')+'>Create task</button></form><div id="message" role="alert" aria-live="polite"></div><label style="margin-top:20px">Task filter<select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select></label><section class="rows" id="tasks" aria-label="Tasks"></section>';document.querySelector('#back').onclick=()=>location.assign('/');document.querySelector('#create-task').onsubmit=async e=>{e.preventDefault();const title=document.querySelector('#task-title').value.trim();if(!title){document.querySelector('#message').innerHTML='<p class="alert">Task title is required</p>';return}try{await req('/api/projects/'+id+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});e.target.reset();document.querySelector('#message').textContent='';await tasks(id,p.archived)}catch{document.querySelector('#message').textContent='Unable to create task'}};document.querySelector('#task-filter').onchange=()=>tasks(id,p.archived);await tasks(id,p.archived);return}
root.innerHTML='<h1>Workboard</h1><label>Project filter<select id="project-filter"><option>Active</option><option>Archived</option></select></label><form id="create"><label for="project-name">Project name</label><input id="project-name"><button>Create project</button></form><div id="message" role="alert" aria-live="polite"></div><section class="rows" id="projects" aria-label="Projects"></section>';document.querySelector('#create').onsubmit=async e=>{e.preventDefault();const name=document.querySelector('#project-name').value.trim();if(!name){document.querySelector('#message').innerHTML='<p class="alert">Project name is required</p>';return}try{await req('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});e.target.reset();document.querySelector('#message').textContent='';await projects()}catch{document.querySelector('#message').textContent='Unable to create project'}};document.querySelector('#project-filter').onchange=projects;await projects()}
async function projects(){const filter=document.querySelector('#project-filter').value;const all=await req('/api/projects'),rows=all.filter(p=>filter==='Archived'?p.archived:!p.archived),list=document.querySelector('#projects');list.innerHTML=rows.length?rows.map(p=>'<div class="row" data-testid="project-row"><span class="name">'+esc(p.name)+'</span><span data-testid="project-summary">'+p.completed+'/'+p.total+' completed</span><div class="actions"><button data-open="'+p.id+'">Open project</button><button class="secondary" data-archive="'+p.id+'">'+(p.archived?'Restore project':'Archive project')+'</button></div></div>').join(''):'<p class="empty">No '+filter.toLowerCase()+' projects.</p>';list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>location.assign('/projects/'+b.dataset.open));list.querySelectorAll('[data-archive]').forEach(b=>b.onclick=async()=>{await req('/api/projects/'+b.dataset.archive,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:filter!=='Archived'})});await projects()})}
async function tasks(id,archived){const filter=document.querySelector('#task-filter').value,all=await req('/api/projects/'+id+'/tasks'),shown=all.filter(t=>filter==='All'||(filter==='Open'&&!t.completed)||(filter==='Completed'&&t.completed)),list=document.querySelector('#tasks');list.innerHTML=shown.length?shown.map(t=>'<div class="row" data-testid="task-row"><label class="task-name"><input type="checkbox" aria-label="Complete '+esc(t.title)+'" data-id="'+t.id+'" '+(t.completed?'checked':'')+' '+(archived?'disabled':'')+'><span class="name">'+esc(t.title)+'</span></label></div>').join(''):'<p class="empty">No tasks to show.</p>';list.querySelectorAll('input[type=checkbox]').forEach(box=>box.onchange=async()=>{await req('/api/tasks/'+box.dataset.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:box.checked})});await tasks(id,archived)})}render();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total, COALESCE(SUM(t.completed), 0) AS completed
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.id ASC`).all().map(p => ({ ...p, archived: !!p.archived })));
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, db.prepare('SELECT id, name FROM projects WHERE id = ?').get(result.lastInsertRowid));
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (req.method === 'GET' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC').all(projectId).map(t => ({ ...t, completed: !!t.completed })));
  }
  if (req.method === 'POST' && tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return send(res, 404, { error: 'Project not found' });
    const data = await readJson(req);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) return send(res, 400, { error: 'Task title is required' });
    const result = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(projectId, title);
    const task = db.prepare('SELECT id, title, completed FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    return send(res, 201, { ...task, completed: !!task.completed });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === 'PATCH' && taskMatch) {
    const data = await readJson(req);
    if (typeof data?.completed !== 'boolean') return send(res, 400, { error: 'Completion state is required' });
    const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]));
    if (!result.changes) return send(res, 404, { error: 'Task not found' });
    return send(res, 200, { ok: true });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, { ...project, archived: !!project.archived }) : send(res, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && archiveMatch) {
    const data = await readJson(req);
    if (typeof data?.archived !== 'boolean') return send(res, 400, { error: 'Archive state is required' });
    const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(data.archived ? 1 : 0, Number(archiveMatch[1]));
    if (!result.changes) return send(res, 404, { error: 'Project not found' });
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(res, 200, app, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    process.exit(0);
  });
  // Do not let idle keep-alive sockets prevent the close callback from
  // flushing and closing SQLite during a real process restart.
  server.closeAllConnections();
});
