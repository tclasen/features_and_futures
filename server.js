import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}h1{font-size:2rem}form{display:flex;gap:.6rem;margin:1.5rem 0}input,button{font:inherit;padding:.55rem .8rem}input{flex:1;border:1px solid #9aa4b2;border-radius:4px}button{cursor:pointer;border:0;border-radius:4px;background:#2459a9;color:white}.project-row{display:flex;align-items:center;justify-content:space-between;padding:.8rem;border-bottom:1px solid #ddd}.alert{color:#a31621;margin:.5rem 0}</style></head>
<body><main id="app"></main><script>
const app=document.getElementById('app');
async function projects(){const r=await fetch('/api/projects');return r.json()}
function go(path){history.pushState({},'',path);render()}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const items=await projects();const p=items.find(x=>String(x.id)===match[1]);if(!p){go('/');return}app.innerHTML='<button id="back">Projects</button><h1></h1>';app.querySelector('h1').textContent=p.name;app.querySelector('#back').onclick=()=>go('/');return}
app.innerHTML='<h1>Workboard</h1><form><label for="project-name">Project name</label><input id="project-name" aria-label="Project name"><button type="submit">Create project</button></form><div id="alert" class="alert" role="alert"></div><section id="projects"></section>';
const form=app.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const input=app.querySelector('#project-name');const name=input.value.trim();if(!name){app.querySelector('#alert').textContent='Project name is required';return}await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});render()};
const list=await projects(), section=app.querySelector('#projects');for(const p of list){const row=document.createElement('div');row.dataset.testid='project-row';row.className='project-row';const name=document.createElement('span');name.textContent=p.name;const button=document.createElement('button');button.textContent='Open project';button.onclick=()=>go('/projects/'+p.id);row.append(name,button);section.append(row)}
}
window.onpopstate=render;render();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"status":"ok"}'); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all())); return;
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    try { const name = JSON.parse(body).name; if (typeof name !== 'string' || !name.trim()) { res.writeHead(400); res.end(); return; }
      const result = db.prepare('INSERT INTO projects(name) VALUES (?)').run(name.trim());
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: Number(result.lastInsertRowid), name: name.trim() }));
    } catch { res.writeHead(400); res.end(); } return;
  }
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); return; }
  res.writeHead(404); res.end();
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
