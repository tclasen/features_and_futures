import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workboard</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#202936;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:56px auto;padding:32px;background:white;border:1px solid #dfe4ea;border-radius:12px;box-shadow:0 8px 24px #172b4d0d}h1{margin:0 0 24px;font-size:2rem}form{display:flex;gap:12px;align-items:end}label{display:grid;gap:6px;font-weight:600;flex:1}input{font:inherit;padding:10px 12px;border:1px solid #aeb8c4;border-radius:6px}button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:6px;background:#2457c5;color:white;cursor:pointer}button:hover{background:#1946a7}button:focus-visible,input:focus-visible{outline:3px solid #85a9ff;outline-offset:2px}.rows{display:grid;gap:10px;margin-top:24px}.row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:1px solid #dfe4ea;border-radius:8px}.alert{margin-top:12px;color:#a42525;font-weight:600}.empty{color:#586575}a{color:inherit}@media(max-width:600px){main{margin:20px 12px;padding:22px}form{align-items:stretch;flex-direction:column}}
</style></head><body><main id="app"><h1>Workboard</h1><form id="create-form"><label for="project-name">Project name</label><input id="project-name" name="name" autocomplete="off"><button type="submit">Create project</button></form><div id="message" class="alert" role="alert" aria-live="polite"></div><section id="projects" class="rows" aria-label="Projects"></section></main>
<script>
const app=document.querySelector('#app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadProjects(){const response=await fetch('/api/projects');const projects=await response.json();const list=document.querySelector('#projects');list.innerHTML=projects.length?projects.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><button type="button" data-open="'+p.id+'">Open project</button></div>').join(''):'<p class="empty">No projects yet.</p>';list.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>location.href='/projects/'+button.dataset.open))}
function projectPage(project){document.title=project.name+' · Workboard';app.innerHTML='<button type="button" id="back">Projects</button><h1>'+escapeHtml(project.name)+'</h1>';document.querySelector('#back').addEventListener('click',()=>location.href='/')}
async function start(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){location.replace('/');return}projectPage(await response.json());return}if(location.pathname!=='/'){location.replace('/');return}document.querySelector('#create-form').addEventListener('submit',async event=>{event.preventDefault();const input=document.querySelector('#project-name');const name=input.value.trim();const message=document.querySelector('#message');if(!name){message.textContent='Project name is required';input.focus();return}message.textContent='';const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(response.ok){input.value='';await loadProjects()}});await loadProjects()}
start();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return json(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return json(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return json(res, 400, { error: 'Invalid request' });
    }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  json(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
