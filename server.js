import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title><link rel="stylesheet" href="/style.css"></head>
<body><main id="app" aria-live="polite"></main><script src="/app.js" defer></script></body></html>`;
const style = `:root{font-family:system-ui,sans-serif;color:#172033;background:#f4f6fa}body{margin:0}main{max-width:760px;margin:4rem auto;padding:0 1.25rem}h1{font-size:2rem}.card{background:white;border:1px solid #dce2ec;border-radius:10px;padding:1.5rem;box-shadow:0 3px 12px #1720330b}form{display:flex;gap:.75rem;align-items:end;flex-wrap:wrap}label{display:grid;gap:.4rem;font-weight:600;flex:1}input,button{font:inherit;padding:.65rem .85rem;border-radius:6px;border:1px solid #9aa6b8}button{cursor:pointer;background:#234fbe;color:white;border-color:#234fbe}button.secondary{background:white;color:#234fbe}.rows{display:grid;gap:.7rem;margin-top:1.2rem}.row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1rem;border:1px solid #dce2ec;border-radius:7px;background:white}.alert{color:#a22020;margin:.8rem 0 0}.top{display:flex;align-items:center;gap:1rem}.top h1{flex:1}`;
const app = `const root=document.querySelector('#app');
async function request(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error('Request failed');return response.json()}
function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function render(){const match=location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);if(match){try{const project=await request('/api/projects/'+encodeURIComponent(match[1]));root.innerHTML='<div class="top"><button class="secondary" id="back">Projects</button><h1>'+esc(project.name)+'</h1></div>';document.querySelector('#back').onclick=()=>{history.pushState({},'', '/');render()};}catch{history.replaceState({},'', '/');render()}return}
root.innerHTML='<h1>Workboard</h1><section class="card"><form id="create"><label>Project name<input name="name" aria-label="Project name" autocomplete="off"></label><button type="submit">Create project</button></form><p class="alert" role="alert" hidden></p><div class="rows" id="projects"></div></section>';
const alert=root.querySelector('.alert');const list=root.querySelector('#projects');async function load(){const projects=await request('/api/projects');list.innerHTML=projects.map(p=>'<div data-testid="project-row" class="row"><span>'+esc(p.name)+'</span><button data-id="'+esc(p.id)+'">Open project</button></div>').join('');list.querySelectorAll('button').forEach(button=>button.onclick=()=>{history.pushState({},'', '/projects/'+encodeURIComponent(button.dataset.id));render()})}await load();root.querySelector('#create').onsubmit=async event=>{event.preventDefault();const name=new FormData(event.currentTarget).get('name').trim();if(!name){alert.textContent='Project name is required';alert.hidden=false;return}await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});alert.hidden=true;event.currentTarget.reset();await load()}}
addEventListener('popstate',render);render();`;

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, app, 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/style.css') return send(res, 200, style, 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (body.length > 10000) return send(res, 413, { error: 'Request too large' });
      const name = String(JSON.parse(body).name ?? '').trim();
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const id = randomUUID();
      db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());
      return send(res, 201, { id, name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) return send(res, 200, html, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
