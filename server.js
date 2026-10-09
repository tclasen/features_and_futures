import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workboard</title><link rel="stylesheet" href="/style.css"></head>
<body><main id="app" aria-live="polite"></main><script type="module" src="/app.js"></script></body></html>`;
const assets = {
  '/': [page, 'text/html; charset=utf-8'],
  '/app.js': [String.raw`const app = document.querySelector('#app');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function projects() { const r = await fetch('/api/projects'); return r.json(); }
function renderList(message = '') {
  app.innerHTML = '<h1>Workboard</h1><form id="create"><label for="project-name">Project name</label><div class="form-row"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div></form>' + (message ? '<p class="alert" role="alert">'+escapeHtml(message)+'</p>' : '') + '<section id="projects" aria-label="Projects"></section>';
  const form = document.querySelector('#create');
  form.addEventListener('submit', async e => { e.preventDefault(); const name = new FormData(form).get('name').trim(); if (!name) { renderList('Project name is required'); return; } await fetch('/api/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) }); renderList(); });
  projects().then(items => { const list = document.querySelector('#projects'); if (!list) return; list.innerHTML = items.map(p => '<div data-testid="project-row" class="project-row"><span>'+escapeHtml(p.name)+'</span><button type="button" data-id="'+p.id+'">Open project</button></div>').join(''); list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { location.href = '/projects/'+b.dataset.id; })); });
}
async function renderProject(id) {
  const r = await fetch('/api/projects/'+encodeURIComponent(id));
  if (!r.ok) { renderList(); return; }
  const p = await r.json(); app.innerHTML = '<button type="button" id="back">Projects</button><h1>'+escapeHtml(p.name)+'</h1>'; document.querySelector('#back').addEventListener('click', () => { location.href='/'; });
}
const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]); else renderList();`, 'text/javascript; charset=utf-8'],
  '/style.css': [String.raw`*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:64px auto;padding:32px;background:#fff;border:1px solid #e1e6ef;border-radius:12px;box-shadow:0 8px 28px #1720330b}h1{margin:0 0 28px;font-size:2rem}label{display:block;font-weight:600;margin-bottom:8px}.form-row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #aab4c5;border-radius:6px;padding:10px 12px;font:inherit}button{border:0;border-radius:6px;padding:10px 16px;background:#315bd6;color:white;font:600 15px system-ui;cursor:pointer}button:hover{background:#2348b8}.project-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #dce2ec;border-radius:8px;padding:12px 14px;margin-top:12px}.alert{color:#a51e2d;font-weight:600;margin-bottom:0}@media(max-width:600px){main{margin:20px;padding:22px}.form-row{align-items:stretch;flex-direction:column}}`, 'text/css; charset=utf-8']
};

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) throw new Error('Request too large'); }
  return JSON.parse(body || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readJson(req);
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return send(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmed);
      return send(res, 201, { id: Number(result.lastInsertRowid), name: trimmed });
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && assets[url.pathname]) { const [body, type] = assets[url.pathname]; return send(res, 200, body, type); }
  if (req.method === 'GET' && url.pathname.startsWith('/projects/')) return send(res, 200, page, 'text/html; charset=utf-8');
  return send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
