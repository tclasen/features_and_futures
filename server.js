import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#1d2939;font:16px system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:2rem;margin:0 0 28px}form,.panel{background:white;border:1px solid #dce3ed;border-radius:12px;padding:22px;box-shadow:0 3px 12px #18243a0b}label{display:block;font-weight:600;margin-bottom:8px}input{font:inherit;border:1px solid #b9c5d4;border-radius:7px;padding:10px 12px;width:100%;margin-bottom:14px}button{font:inherit;font-weight:600;border:0;border-radius:7px;padding:10px 16px;background:#315bd6;color:white;cursor:pointer}button.secondary{background:#e9eef8;color:#263650}.rows{margin-top:22px;display:grid;gap:12px}.row{background:#fff;border:1px solid #dce3ed;border-radius:10px;padding:16px;display:flex;align-items:center;justify-content:space-between}.row span{font-weight:600}.alert{color:#b42318;margin:12px 0 0}.back{margin-bottom:22px}
</style></head><body><main id="app"></main><script>
const app=document.getElementById('app');
async function projects(){const r=await fetch('/api/projects');return r.json()}
function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const list=await projects();const project=list.find(item=>String(item.id)===match[1]);if(!project){app.innerHTML='<h1>Project not found</h1><button class="secondary" id="back">Projects</button>';document.getElementById('back').onclick=()=>location.href='/';return}app.innerHTML='<button class="secondary back" id="back">Projects</button><h1>'+escapeText(project.name)+'</h1>';document.getElementById('back').onclick=()=>location.href='/';return}
app.innerHTML='<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button><p class="alert" id="alert" role="alert" hidden></p></form><section class="rows" id="rows" aria-label="Projects"></section>';
const input=document.getElementById('project-name'), alert=document.getElementById('alert');
async function draw(){const items=await projects();document.getElementById('rows').innerHTML=items.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeText(p.name)+'</span><button data-id="'+p.id+'">Open project</button></div>').join('');document.querySelectorAll('.row button').forEach(b=>b.onclick=()=>location.href='/projects/'+b.dataset.id)}
document.getElementById('create').onsubmit=async e=>{e.preventDefault();const name=input.value.trim();if(!name){alert.textContent='Project name is required';alert.hidden=false;return}alert.hidden=true;const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok){input.value='';await draw()}};await draw()}
render();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"status":"ok"}'); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const rows = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(rows)); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const name = String(JSON.parse(body).name ?? '').trim();
        if (!name) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Project name is required' })); return; }
        const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
        res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: Number(result.lastInsertRowid), name }));
      } catch { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"Invalid request"}'); }
    }); return;
  }
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
  res.writeHead(404); res.end('Not found');
});
server.listen(port, '0.0.0.0');
