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
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17233b; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(720px, calc(100% - 32px)); margin: 56px auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; gap: 10px; margin-bottom: 20px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #aeb9ca; border-radius: 6px; font: inherit; }
    button { padding: 10px 14px; border: 0; border-radius: 6px; background: #2458c6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1947a8; }
    .project-list { display: grid; gap: 10px; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: white; border: 1px solid #dce2ec; border-radius: 8px; }
    [role="alert"] { margin: 0 0 14px; color: #a21c28; }
    .empty { color: #59677e; }
    .back { margin: 0 0 24px; }
    @media (max-width: 520px) { form { flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const root = document.querySelector('#app');
    const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function request(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }
    function projectIdFromPath() {
      const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
      return match ? match[1] : null;
    }
    async function showList(message = '') {
      root.innerHTML = '<h1>Workboard</h1><form id="create-form"><label for="project-name" style="position:absolute;left:-10000px">Project name</label><input id="project-name" name="name" aria-label="Project name" autocomplete="off"><button type="submit">Create project</button></form><div id="message" role="alert"></div><div class="project-list" id="projects"></div>';
      if (message) root.querySelector('#message').textContent = message;
      const list = root.querySelector('#projects');
      const projects = await request('/api/projects');
      if (!projects.length) list.innerHTML = '<p class="empty">No projects yet.</p>';
      for (const project of projects) {
        const row = document.createElement('div');
        row.dataset.testid = 'project-row';
        row.innerHTML = '<span>' + esc(project.name) + '</span><button type="button">Open project</button>';
        row.querySelector('button').addEventListener('click', () => navigate('/projects/' + project.id));
        list.append(row);
      }
      root.querySelector('#create-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = root.querySelector('#project-name').value.trim();
        if (!name) { root.querySelector('#message').textContent = 'Project name is required'; return; }
        await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        showList();
      });
    }
    async function showProject(id) {
      let project;
      try { project = await request('/api/projects/' + encodeURIComponent(id)); }
      catch { navigate('/'); return; }
      root.innerHTML = '<button class="back" type="button">Projects</button><h1>' + esc(project.name) + '</h1>';
      root.querySelector('.back').addEventListener('click', () => navigate('/'));
    }
    function render() {
      const id = projectIdFromPath();
      if (id) showProject(id); else showList();
    }
    function navigate(path) { history.pushState({}, '', path); render(); }
    addEventListener('popstate', render);
    render();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    sendJson(response, 200, db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all());
    return;
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    const body = await readBody(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectMatch[1]);
    if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
    sendJson(response, 200, project);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
