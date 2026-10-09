import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || resolve(root, 'workboard.sqlite'));
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workboard</title><style>
body{font:16px system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#20242a}h1{font-size:2rem}form{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.5rem 0}input,button{font:inherit;padding:.55rem .75rem}input{flex:1;min-width:12rem}button{cursor:pointer}.project-row{display:flex;align-items:center;justify-content:space-between;border:1px solid #cbd0d6;border-radius:6px;padding:.75rem;margin:.5rem 0}#alert{color:#a11;margin:.5rem 0}
</style></head><body><main id="app"></main><script>
const app=document.querySelector('#app');
function escapeText(value){return String(value).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
async function projects(){const r=await fetch('/api/projects');if(!r.ok)throw new Error('Could not load projects');return r.json();}
function navigate(path){history.pushState({},'',path);render();}
async function render(){
 const pathParts=location.pathname.split('/').filter(Boolean);
 const projectId=pathParts.length===2 && pathParts[0]==='projects' ? Number(pathParts[1]) : NaN;
 if(Number.isSafeInteger(projectId) && projectId>0 && String(projectId)===pathParts[1]){try{const r=await fetch('/api/projects/'+projectId);if(!r.ok){app.innerHTML='<h1>Project not found</h1><button id="back">Projects</button>';app.querySelector('#back').onclick=()=>navigate('/');return;}const p=await r.json();app.innerHTML='<button id="back">Projects</button><h1>'+escapeText(p.name)+'</h1>';app.querySelector('#back').onclick=()=>navigate('/');}catch{app.innerHTML='<h1>Unable to load project</h1><button id="back">Projects</button>';app.querySelector('#back').onclick=()=>navigate('/');}return;}
 app.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" name="name" type="text"><button type="submit">Create project</button></form><div id="alert" role="alert" aria-live="polite"></div><section id="projects" aria-label="Projects"></section>';
 const form=app.querySelector('#create'), input=app.querySelector('#project-name'), alert=app.querySelector('#alert'), list=app.querySelector('#projects');
 async function refresh(){const rows=await projects();list.innerHTML=rows.map(p=>'<div class="project-row" data-testid="project-row"><span>'+escapeText(p.name)+'</span><button data-id="'+p.id+'">Open project</button></div>').join('');list.querySelectorAll('button').forEach(b=>b.onclick=()=>navigate('/projects/'+b.dataset.id));}
 await refresh();form.onsubmit=async e=>{e.preventDefault();const name=input.value.trim();if(!name){alert.textContent='Project name is required';input.focus();return;}alert.textContent='';const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok){input.value='';await refresh();}};
}
addEventListener('popstate',render);render();
</script></body></html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const value = JSON.parse(body);
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
