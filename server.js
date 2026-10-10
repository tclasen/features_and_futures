import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 760px; margin: 3rem auto; padding: 0 1.25rem; color: #17212b; }
  h1 { margin-bottom: 1.5rem; } form { display: flex; gap: .6rem; flex-wrap: wrap; }
  input, button { font: inherit; padding: .55rem .75rem; } input { flex: 1; min-width: 220px; }
  button { cursor: pointer; } .project-row { display:flex; align-items:center; justify-content:space-between; border:1px solid #ccd4dc; border-radius:6px; padding:.75rem 1rem; margin:.6rem 0; }
  [role=alert] { color:#a11; margin-top:.75rem; }
</style></head><body><main id="app"></main><script>
const app = document.querySelector('#app');
function heading(text) { const h = document.createElement('h1'); h.textContent = text; return h; }
function button(label, action) { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click', action); return b; }
function go(path) { history.pushState({}, '', path); render(); }
async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (response.ok) { const project = await response.json(); app.append(heading(project.name), button('Projects', () => go('/'))); return; }
    go('/'); return;
  }
  app.append(heading('Workboard'));
  const form = document.createElement('form');
  const input = document.createElement('input'); input.type='text'; input.setAttribute('aria-label','Project name');
  const submit = document.createElement('button'); submit.type='submit'; submit.textContent='Create project';
  const alert = document.createElement('div'); alert.setAttribute('role','alert'); alert.hidden=true;
  form.append(input, submit); app.append(form, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault(); const name=input.value.trim();
    if (!name) { alert.textContent='Project name is required'; alert.hidden=false; return; }
    const response=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
    if (response.ok) { input.value=''; await loadRows(); }
  });
  await loadRows();
  async function loadRows() {
    const projects=await (await fetch('/api/projects')).json();
    app.querySelectorAll('[data-testid="project-row"]').forEach(row=>row.remove());
    for (const project of projects) {
      const row=document.createElement('div'); row.dataset.testid='project-row'; row.className='project-row';
      const name=document.createElement('span'); name.textContent=project.name;
      row.append(name, button('Open project',()=>go('/projects/'+project.id))); app.append(row);
    }
  }
}
addEventListener('popstate', render); render();
</script></body></html>`;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return send(response, 200, listProjects.all());
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(response, 200, project) : send(response, 404, { error: 'Not found' });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of request) raw += chunk;
      const data = JSON.parse(raw);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return send(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(response, 200, page, 'text/html; charset=utf-8');
  }
  send(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
