import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}h1{font-size:2rem}form{display:flex;gap:.6rem;margin:1.5rem 0}input,button{font:inherit;padding:.55rem .8rem}input{flex:1;border:1px solid #9aa4b2;border-radius:4px}button{cursor:pointer;border:0;border-radius:4px;background:#2459a9;color:white}.project-row{display:flex;align-items:center;justify-content:space-between;padding:.8rem;border-bottom:1px solid #ddd}.alert{color:#a31621;margin:.5rem 0}</style></head>
<body><main id="app"></main><script>
const app=document.getElementById('app');
async function projects(){const r=await fetch('/api/projects');return r.json()}
function go(path){history.pushState({},'',path);render()}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){const items=await projects();const p=items.find(x=>String(x.id)===match[1]);if(!p){go('/');return}
app.innerHTML='<button id="back">Projects</button><h1></h1><form id="task-form"><label for="task-title">Task title</label><input id="task-title"><button type="submit">Create task</button></form><div id="alert" class="alert" role="alert"></div><label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select><section id="tasks"></section>';
app.querySelector('h1').textContent=p.name;app.querySelector('#back').onclick=()=>go('/');const filter=app.querySelector('#task-filter');
const load=async()=>{const r=await fetch('/api/projects/'+p.id+'/tasks');const tasks=await r.json();const section=app.querySelector('#tasks');section.replaceChildren();for(const t of tasks){if(filter.value==='Open'&&t.completed||filter.value==='Completed'&&!t.completed)continue;const row=document.createElement('div');row.dataset.testid='task-row';row.className='project-row';const title=document.createElement('span');title.textContent=t.title;const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!t.completed;checkbox.setAttribute('aria-label','Complete '+t.title);checkbox.onchange=async()=>{await fetch('/api/tasks/'+t.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:checkbox.checked})});load()};row.append(title,checkbox);section.append(row)}};
filter.onchange=load;app.querySelector('#task-form').onsubmit=async e=>{e.preventDefault();const input=app.querySelector('#task-title'),title=input.value.trim();if(!title){app.querySelector('#alert').textContent='Task title is required';return}await fetch('/api/projects/'+p.id+'/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});input.value='';app.querySelector('#alert').textContent='';load()};load();return}
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
  const taskRoute = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskRoute && req.method === 'GET') {
    const tasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id').all(Number(taskRoute[1]));
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(tasks)); return;
  }
  if (taskRoute && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    try { const title = JSON.parse(body).title; if (typeof title !== 'string' || !title.trim()) { res.writeHead(400); res.end(); return; }
      if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(taskRoute[1]))) { res.writeHead(404); res.end(); return; }
      const result = db.prepare('INSERT INTO tasks(project_id, title) VALUES (?, ?)').run(Number(taskRoute[1]), title.trim());
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: Number(result.lastInsertRowid), title: title.trim(), completed: 0 }));
    } catch { res.writeHead(400); res.end(); } return;
  }
  const taskRouteId = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskRouteId && req.method === 'PATCH') {
    let body = ''; for await (const chunk of req) body += chunk;
    try { const completed = JSON.parse(body).completed; if (typeof completed !== 'boolean') { res.writeHead(400); res.end(); return; }
      const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, Number(taskRouteId[1]));
      res.writeHead(result.changes ? 204 : 404); res.end();
    } catch { res.writeHead(400); res.end(); } return;
  }
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); return; }
  res.writeHead(404); res.end();
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
