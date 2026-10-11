import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
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
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}header{background:#fff;border-bottom:1px solid #e1e6ef;padding:18px max(24px,calc((100% - 900px)/2));font-size:20px;font-weight:700}.container{max-width:900px;margin:48px auto;padding:0 24px}h1{font-size:32px;margin:0 0 24px}form{display:flex;gap:12px;max-width:600px;margin-bottom:24px}input{flex:1;min-width:0;border:1px solid #b9c3d2;border-radius:6px;padding:11px 12px;font:inherit}button{border:0;border-radius:6px;background:#265bd5;color:white;padding:11px 16px;font:600 15px inherit;cursor:pointer}button:hover{background:#1949b7}.row{background:white;border:1px solid #e1e6ef;border-radius:8px;padding:16px;margin:10px 0;display:flex;align-items:center;justify-content:space-between}.row button{padding:8px 14px}.alert{color:#a32626;margin:0 0 14px}[hidden]{display:none}
</style></head><body><header>Workboard</header><main class="container" id="app"></main>
<script>
const app=document.getElementById('app');
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){history.replaceState({},'', '/');return render()}const p=await response.json();app.innerHTML='<button id="back">Projects</button><h1>'+escapeHtml(p.name)+'</h1>';document.getElementById('back').onclick=()=>{history.pushState({},'','/');render()};return}
const response=await fetch('/api/projects');const projects=await response.json();app.innerHTML='<h1>Workboard</h1><form id="create"><input id="name" aria-label="Project name" placeholder="Project name"><button type="submit">Create project</button></form><p class="alert" id="alert" role="alert" hidden></p><section id="projects"></section>';const list=document.getElementById('projects');list.innerHTML=projects.map(p=>'<div class="row" data-testid="project-row"><span>'+escapeHtml(p.name)+'</span><button data-id="'+p.id+'">Open project</button></div>').join('');list.querySelectorAll('button').forEach(b=>b.onclick=()=>{history.pushState({},'','/projects/'+b.dataset.id);render()});document.getElementById('create').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('name'),name=input.value.trim();const alert=document.getElementById('alert');if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok)render()};}
addEventListener('popstate',render);render();
</script></main></body></html>`;

function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  const item = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && item) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(item[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of req) { body += chunk; if (body.length > 100_000) return send(res, 413, { error: 'Request too large' }); }
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(result.lastInsertRowid)));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(res, 200, html, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0');
