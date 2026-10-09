import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#172033}h1{font-size:2rem}form{display:flex;gap:10px;margin:24px 0}input{font:inherit;padding:10px;flex:1}button{font:inherit;padding:9px 15px;cursor:pointer}.project-row{display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:1px solid #ddd}.alert{color:#a21b1b;min-height:1.5em}.back{margin-bottom:20px}</style></head>
<body><main id="app"></main><script>
const app=document.querySelector('#app');
function esc(value){return String(value).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const response=await fetch('/api/projects/'+match[1]);if(!response.ok){history.replaceState({},'', '/');return render()}const project=await response.json();app.innerHTML='<button class="back" id="projects">Projects</button><h1>'+esc(project.name)+'</h1>';document.querySelector('#projects').onclick=()=>{history.pushState({},'','/');render()};return}
const response=await fetch('/api/projects');const projects=await response.json();app.innerHTML='<h1>Workboard</h1><form id="create"><label for="name">Project name</label><input id="name" name="name" aria-label="Project name"><button>Create project</button></form><div class="alert" role="alert" aria-live="polite" id="alert"></div><section id="projects-list">'+projects.map(p=>'<div class="project-row" data-testid="project-row"><span>'+esc(p.name)+'</span><button data-id="'+p.id+'">Open project</button></div>').join('')+'</section>';
document.querySelector('#create').onsubmit=async e=>{e.preventDefault();const input=document.querySelector('#name'),name=input.value.trim();if(!name){document.querySelector('#alert').textContent='Project name is required';return}const result=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(result.ok)render()};document.querySelectorAll('#projects-list button').forEach(button=>button.onclick=()=>{history.pushState({},'','/projects/'+button.dataset.id);render()})}
window.onpopstate=render;render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error('Request too large'); }
  return JSON.parse(raw || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) return send(res, 200, html, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
