import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#202b3c;font:16px system-ui,-apple-system,sans-serif}main{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:32px;margin:0 0 28px}form{display:flex;gap:12px;margin-bottom:24px}input{flex:1;min-width:0;padding:12px 14px;border:1px solid #bdc7d5;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:11px 16px;background:#2659c7;color:white;font:inherit;cursor:pointer}button:hover{background:#1947a8}.row{display:flex;align-items:center;justify-content:space-between;gap:16px;background:white;border:1px solid #dce2eb;border-radius:7px;padding:14px 16px;margin:10px 0}.row-name{overflow-wrap:anywhere}.alert{color:#a11;font-weight:600;margin:0 0 16px}[hidden]{display:none!important}.back{margin-bottom:22px}
</style></head><body><main><section id="list-view"><h1>Workboard</h1><form id="create-form"><input id="project-name" aria-label="Project name" placeholder="Project name"><button type="submit">Create project</button></form><p id="error" class="alert" role="alert" hidden></p><div id="projects"></div></section><section id="project-view" hidden><button id="back" class="back" type="button">Projects</button><h1 id="project-title"></h1></section></main>
<script>
const listView=document.querySelector('#list-view'),projectView=document.querySelector('#project-view'), projects=document.querySelector('#projects'),error=document.querySelector('#error');
async function request(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error('Request failed');return response.json()}
function renderRows(rows){projects.replaceChildren(...rows.map(project=>{const row=document.createElement('div');row.className='row';row.dataset.testid='project-row';const name=document.createElement('span');name.className='row-name';name.textContent=project.name;const button=document.createElement('button');button.type='button';button.textContent='Open project';button.addEventListener('click',()=>{history.pushState({},'', '/projects/'+project.id);showRoute()});row.append(name,button);return row}))}
async function showRoute(){const match=location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);if(match){try{const project=await request('/api/projects/'+match[1]);listView.hidden=true;projectView.hidden=false;document.querySelector('#project-title').textContent=project.name}catch{history.replaceState({},'', '/');showRoute()}return}projectView.hidden=true;listView.hidden=false;renderRows(await request('/api/projects'))}
document.querySelector('#create-form').addEventListener('submit',async event=>{event.preventDefault();const input=document.querySelector('#project-name');const name=input.value.trim();if(!name){error.textContent='Project name is required';error.hidden=false;return}error.hidden=true;await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});input.value='';await showRoute()});document.querySelector('#back').addEventListener('click',()=>{history.pushState({},'', '/');showRoute()});addEventListener('popstate',showRoute);showRoute();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, listProjects.all());
  if (req.method === 'GET' && /^\/api\/projects\/\d+$/.test(url.pathname)) {
    const project = getProject.get(Number(url.pathname.split('/').pop()));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      let data = '';
      for await (const chunk of req) { data += chunk; if (data.length > 10000) return send(res, 413, { error: 'Too large' }); }
      const name = String(JSON.parse(data).name ?? '').trim();
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = createProject.run(name);
      return send(res, 201, { id: Number(result.lastInsertRowid), name });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) return send(res, 200, page, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
