import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:56px auto;padding:0 24px}h1{font-size:2rem;margin:0 0 28px}form{display:flex;gap:12px;align-items:end;padding:22px;background:white;border:1px solid #e0e5ef;border-radius:10px}label{display:block;font-weight:600;margin-bottom:6px}input{width:100%;padding:10px 12px;border:1px solid #bac4d4;border-radius:6px;font:inherit}button{padding:10px 16px;border:0;border-radius:6px;background:#315fce;color:white;font:600 1rem inherit;cursor:pointer;white-space:nowrap}button:hover{background:#254ca8}.field{flex:1}#alert{color:#a32121;margin:12px 0 0}.rows{display:grid;gap:10px;margin-top:24px}.row{display:flex;justify-content:space-between;align-items:center;background:white;border:1px solid #e0e5ef;border-radius:8px;padding:14px 16px}.name{font-weight:600}.back{margin-bottom:20px} @media(max-width:520px){.wrap{margin:32px auto}form{align-items:stretch;flex-direction:column}}
</style></head><body><main class="wrap" id="app"></main><script>
const app=document.querySelector('#app');
function button(text,handler,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.addEventListener('click',handler);return b}
async function projects(){const r=await fetch('/api/projects');if(!r.ok)throw Error('Could not load projects');return r.json()}
async function render(){const match=location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);app.replaceChildren();if(match){const id=decodeURIComponent(match[1]);const r=await fetch('/api/projects/'+encodeURIComponent(id));if(!r.ok){app.innerHTML='<h1>Project not found</h1>';app.append(button('Projects',()=>navigate('/')));return}const p=await r.json();app.append(button('Projects',()=>navigate('/'),'back'));const h=document.createElement('h1');h.textContent=p.name;app.append(h);return}
const heading=document.createElement('h1');heading.textContent='Workboard';app.append(heading);const form=document.createElement('form');form.setAttribute('aria-label','Create project form');const field=document.createElement('div');field.className='field';const label=document.createElement('label');label.htmlFor='project-name';label.textContent='Project name';const input=document.createElement('input');input.id='project-name';input.name='name';input.type='text';input.autocomplete='off';field.append(label,input);const submit=document.createElement('button');submit.type='submit';submit.textContent='Create project';form.append(field,submit);app.append(form);const alert=document.createElement('p');alert.id='alert';alert.setAttribute('role','alert');alert.hidden=true;app.append(alert);const list=document.createElement('div');list.className='rows';list.setAttribute('aria-label','Projects');app.append(list);form.addEventListener('submit',async e=>{e.preventDefault();const name=input.value.trim();if(!name){alert.textContent='Project name is required';alert.hidden=false;return}const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(!r.ok)return;input.value='';alert.hidden=true;await loadRows(list)});await loadRows(list)}
async function loadRows(list){for(const p of await projects()){const row=document.createElement('div');row.className='row';row.dataset.testid='project-row';const name=document.createElement('span');name.className='name';name.textContent=p.name;row.append(name,button('Open project',()=>navigate('/projects/'+encodeURIComponent(p.id))));list.append(row)}}
function navigate(path){history.pushState({},'',path);render()}window.addEventListener('popstate',render);render().catch(()=>{app.textContent='Unable to load Workboard'})
</script></body></html>`;

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(req);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return send(res, 400, { error: 'Project name is required' });
    const project = { id: randomUUID(), name };
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
    return send(res, 201, project);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(decodeURIComponent(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
