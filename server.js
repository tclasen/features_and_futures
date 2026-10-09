import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const app = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #17212b; background: #f5f7fa; font: 16px/1.5 system-ui, sans-serif; }
    main { width: min(720px, calc(100% - 32px)); margin: 64px auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form, .project-row { display: flex; gap: 12px; align-items: center; }
    form { margin-bottom: 24px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #aab5c2; border-radius: 6px; font: inherit; background: white; }
    button { padding: 10px 15px; border: 0; border-radius: 6px; color: white; background: #245fc5; font: inherit; cursor: pointer; }
    button:hover { background: #174b9f; }
    .project-row { justify-content: space-between; padding: 14px 16px; margin: 10px 0; border: 1px solid #dce2e9; border-radius: 8px; background: white; }
    .alert { margin: 0 0 16px; color: #a32020; }
    [hidden] { display: none !important; }
  </style>
</head>
<body><main id="app"></main>
<script type="module">
const app = document.querySelector('#app');
const escapePath = (id) => '/projects/' + encodeURIComponent(id);
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (response.ok) {
      const project = await response.json();
      app.replaceChildren();
      const back = document.createElement('button');
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1');
      heading.textContent = project.name;
      app.append(back, heading);
      return;
    }
  }
  app.innerHTML = '<h1>Workboard</h1><form><label for="project-name">Project name</label><input id="project-name" name="name" type="text"><button type="submit">Create project</button></form><p class="alert" role="alert" hidden></p><section aria-label="Projects"></section>';
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('section');
  async function load() {
    const projects = await (await fetch('/api/projects')).json();
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = escapePath(project.id); });
      row.append(name, open);
      list.append(row);
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
    alert.hidden = true;
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (response.ok) { input.value = ''; await load(); }
  });
  await load();
}
render();
</script></body></html>`;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return send(res, 200, listProjects.all());
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(res, 201, getProject.get(Number(result.lastInsertRowid)));
    } catch { return send(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return send(res, 200, app, 'text/html; charset=utf-8');
  send(res, 404, { error: 'Not found' });
});
server.listen(port, '0.0.0.0');
