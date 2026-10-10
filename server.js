import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(680px, calc(100% - 32px)); margin: 64px auto; }
    h1 { font-size: 2rem; margin: 0 0 24px; }
    form, .project-row { display: flex; gap: 12px; align-items: center; }
    form { margin-bottom: 16px; }
    input { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid #aab3c2; border-radius: 6px; font: inherit; }
    button { padding: 10px 14px; border: 0; border-radius: 6px; background: #2457c5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #19449e; }
    .project-row { justify-content: space-between; padding: 14px 16px; margin: 10px 0; background: white; border: 1px solid #dce1ea; border-radius: 8px; }
    .project-name { overflow-wrap: anywhere; }
    [role="alert"] { color: #a22121; margin: 8px 0; }
    .back { margin: 0 0 24px; }
    @media (max-width: 480px) { form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body><main id="app"><h1>Workboard</h1><form><label>Project name <input type="text" aria-label="Project name"></label><button type="submit">Create project</button></form><p role="alert" hidden></p><section aria-label="Projects"></section></main>
<script>
const app = document.getElementById('app');
const escapePath = (id) => '/projects/' + encodeURIComponent(id);
async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}
function heading(text) {
  const el = document.createElement('h1'); el.textContent = text; return el;
}
async function renderList() {
  app.replaceChildren(heading('Workboard'));
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text'; input.setAttribute('aria-label', 'Project name');
  const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Create project';
  const alert = document.createElement('p'); alert.setAttribute('role', 'alert'); alert.hidden = true;
  form.append(input, button); app.append(form, alert);
  const list = document.createElement('section'); list.setAttribute('aria-label', 'Projects'); app.append(list);
  async function refresh() {
    const projects = await request('/api/projects');
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div'); row.dataset.testid = 'project-row'; row.className = 'project-row';
      const name = document.createElement('span'); name.className = 'project-name'; name.textContent = project.name;
      const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = escapePath(project.id); });
      row.append(name, open); list.append(row);
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
    alert.hidden = true;
    try { await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); input.value = ''; await refresh(); }
    catch { alert.textContent = 'Unable to create project'; alert.hidden = false; }
  });
  await refresh();
}
async function renderProject(id) {
  const project = await request('/api/projects/' + encodeURIComponent(id));
  const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Projects'; back.className = 'back';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, heading(project.name));
}
const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1])).catch(() => { app.append(heading('Project not found')); });
else renderList();
</script></body></html>`;

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}
async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return send(response, 200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const data = await readJson(request);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? send(response, 200, JSON.stringify(project)) : send(response, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/projects/'))) {
    return send(response, 200, page, 'text/html; charset=utf-8');
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on 0.0.0.0:${port}`));
