import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title>
<style>body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}h1{margin-bottom:1.5rem}form{display:flex;gap:.6rem;align-items:end;flex-wrap:wrap}label{display:grid;gap:.35rem}input,button{font:inherit;padding:.55rem .8rem}button{cursor:pointer}.rows{padding:0;list-style:none}.row{display:flex;justify-content:space-between;align-items:center;padding:.9rem 1rem;margin:.6rem 0;border:1px solid #ccd3df;border-radius:6px}.alert{color:#a21b1b;margin:.75rem 0}</style></head>
<body><main id="app" aria-live="polite"></main><script>
const app=document.querySelector('#app');
function element(tag,text,attrs={}){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el}
async function request(path,options){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options?.headers||{})}});if(!response.ok)throw new Error('Request failed');return response.json()}
function button(text,handler){const b=element('button',text,{type:'button'});b.addEventListener('click',handler);return b}
async function showProjects(){history.pushState({},'', '/');app.replaceChildren();app.append(element('h1','Workboard'));const form=element('form');const label=element('label');label.append(element('span','Project name'));const input=element('input',undefined,{type:'text',name:'name'});label.append(input);form.append(label,element('button','Create project',{type:'submit'}));app.append(form);const alert=element('p',undefined,{class:'alert','aria-live':'assertive'});app.append(alert);form.addEventListener('submit',async event=>{event.preventDefault();try{await request('/api/projects',{method:'POST',body:JSON.stringify({name:input.value})});await showProjects()}catch{alert.textContent='Project name is required'}});const list=element('ul',undefined,{class:'rows'});for(const project of await request('/api/projects')){const row=element('li',undefined,{class:'row','data-testid':'project-row'});row.append(element('span',project.name),button('Open project',()=>showProject(project.id)));list.append(row)}app.append(list)}
async function showProject(id){const project=await request('/api/projects/'+id);history.pushState({},'', '/projects/'+id);app.replaceChildren(element('h1',project.name),button('Projects',showProjects))}
async function render(){const match=location.pathname.match(/^\\/projects\\/(\\d+)$/);if(match){try{await showProject(match[1])}catch{history.replaceState({},'', '/');await showProjects()}}else await showProjects()}
window.addEventListener('popstate',render);render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let name;
    try { name = JSON.parse(raw).name; } catch { return send(res, 400, { error: 'Invalid request' }); }
    name = typeof name === 'string' ? name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return send(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+$/.test(url.pathname))) {
    return send(res, 200, index, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
