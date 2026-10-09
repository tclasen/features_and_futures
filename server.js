import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
:root{font-family:system-ui,sans-serif;color:#202938;background:#f4f6fa}body{margin:0;padding:2rem 1rem}.app{max-width:720px;margin:0 auto}h1{font-size:2rem;margin:0 0 1.5rem}form,.project-row{background:#fff;border:1px solid #dce2eb;border-radius:8px;padding:1rem;margin-bottom:1rem}label{display:block;font-weight:600;margin-bottom:.5rem}input{box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #9ba7b7;border-radius:5px;font:inherit;margin-bottom:.8rem}button{background:#2458c6;color:white;border:0;border-radius:5px;padding:.65rem 1rem;font:inherit;cursor:pointer}button:focus,input:focus{outline:3px solid #8eb5ff;outline-offset:2px}.project-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}.alert{color:#a31d2d;font-weight:600;margin:.5rem 0 1rem}[hidden]{display:none!important}
</style></head><body><main class="app" id="app"></main>
<script>
const app = document.getElementById('app');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (!response.ok) { app.innerHTML = '<h1>Project not found</h1><button id="back">Projects</button>'; document.getElementById('back').onclick = () => navigate('/'); return; }
    const project = await response.json();
    app.innerHTML = '<button id="back">Projects</button><h1>' + escapeHtml(project.name) + '</h1>';
    document.getElementById('back').onclick = () => navigate('/');
    return;
  }
  app.innerHTML = '<h1>Workboard</h1><form id="create-form"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></form><p class="alert" id="error" role="alert" hidden></p><section id="projects" aria-label="Projects"></section>';
  const form = document.getElementById('create-form');
  const error = document.getElementById('error');
  const refresh = async () => {
    const projects = await (await fetch('/api/projects')).json();
    document.getElementById('projects').innerHTML = projects.map(p => '<div class="project-row" data-testid="project-row"><span>' + escapeHtml(p.name) + '</span><button type="button" data-project="' + p.id + '">Open project</button></div>').join('');
    document.querySelectorAll('[data-project]').forEach(button => button.onclick = () => navigate('/projects/' + button.dataset.project));
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const name = new FormData(form).get('name').trim();
    if (!name) { error.textContent = 'Project name is required'; error.hidden = false; return; }
    const response = await fetch('/api/projects', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if (response.ok) { error.hidden = true; form.reset(); await refresh(); }
  };
  await refresh();
}
function navigate(path) { history.pushState({}, '', path); render(); }
window.addEventListener('popstate', render);
render();
</script></body></html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, listProjects.all());
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Not found' });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of request) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
    if (typeof name !== 'string' || !name.trim()) return sendJson(response, 400, { error: 'Project name is required' });
    const result = addProject.run(name.trim());
    return sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
