import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
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

const app = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workboard</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#182235;font:16px/1.5 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:64px auto}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:20px;background:#fff;border:1px solid #e1e6ef;border-radius:12px}label{display:grid;gap:6px;flex:1;font-weight:600}input{font:inherit;border:1px solid #aeb9ca;border-radius:7px;padding:10px 12px;min-width:0}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:7px;background:#2459c4;color:white;cursor:pointer}button:hover{background:#19479f}.back{background:transparent;color:#2459c4;padding:0;margin-bottom:20px}.rows{display:grid;gap:10px;margin-top:20px}.row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:white;border:1px solid #e1e6ef;border-radius:10px;padding:14px 16px}.name{overflow-wrap:anywhere}.alert{color:#a12424;margin:12px 0 0}.empty{color:#5d6879;margin-top:20px}@media(max-width:520px){form{align-items:stretch;flex-direction:column}.row{align-items:flex-start;flex-direction:column}}
</style></head><body><main id="app"></main><script>
const root=document.querySelector('#app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function request(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error('Request failed');return response.json()}
function projectId(){const m=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);return m&&m[1]}
async function render(){const id=projectId();if(id){let project;try{project=await request('/api/projects/'+id)}catch{}if(!project){root.innerHTML='<h1>Project not found</h1><button class="back" id="back">Projects</button>';document.querySelector('#back').onclick=()=>location.assign('/');return}root.innerHTML='<button class="back" id="back">Projects</button><h1>'+escapeHtml(project.name)+'</h1>';document.querySelector('#back').onclick=()=>location.assign('/');return}
root.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><section class="rows" id="projects" aria-label="Projects"></section>';
const form=document.querySelector('#create');form.addEventListener('submit',async event=>{event.preventDefault();const name=document.querySelector('#project-name').value.trim();if(!name){document.querySelector('#message').innerHTML='<p class="alert">Project name is required</p>';return}try{await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});document.querySelector('#message').textContent='';form.reset();await loadProjects()}catch{document.querySelector('#message').innerHTML='<p class="alert">Unable to create project</p>'}});await loadProjects()}
async function loadProjects(){const projects=await request('/api/projects');const list=document.querySelector('#projects');list.innerHTML=projects.length?projects.map(p=>'<div class="row" data-testid="project-row"><span class="name">'+escapeHtml(p.name)+'</span><button type="button" data-id="'+p.id+'">Open project</button></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>location.assign('/projects/'+button.dataset.id)))}
render();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, db.prepare('SELECT id, name FROM projects WHERE id = ?').get(result.lastInsertRowid));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(res, 200, app, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { db.close(); process.exit(0); });
});
