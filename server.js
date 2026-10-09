import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
    main { background: white; border: 1px solid #d8dee8; border-radius: 10px; padding: 28px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    input { flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid #9aa7b7; border-radius: 5px; font: inherit; }
    button { padding: 9px 14px; border: 0; border-radius: 5px; color: white; background: #2458a6; font: inherit; cursor: pointer; }
    button:hover { background: #17437f; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid #e1e6ed; }
    .project-name { overflow-wrap: anywhere; }
    [role="alert"] { color: #a11; margin: 0 0 16px; }
  </style>
</head>
<body><main id="app"></main>
<script>
const app = document.querySelector('#app');
async function render() {
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    const project = projects.find(item => String(item.id) === match[1]);
    app.replaceChildren();
    const back = document.createElement('button'); back.textContent = 'Projects'; back.addEventListener('click', () => { history.pushState({}, '', '/'); render(); });
    app.append(back);
    const heading = document.createElement('h1'); heading.textContent = project ? project.name : 'Project not found'; app.append(heading);
    document.title = project ? project.name + ' - Workboard' : 'Workboard';
    return;
  }
  document.title = 'Workboard';
  app.innerHTML = '<h1>Workboard</h1><form><label for="project-name">Project name</label><input id="project-name" name="name" aria-label="Project name"><button type="submit">Create project</button></form><div id="message" role="alert" aria-live="polite"></div><section id="projects" aria-label="Projects"></section>';
  const form = app.querySelector('form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const message = app.querySelector('#message');
    if (!name) { message.textContent = 'Project name is required'; return; }
    message.textContent = '';
    await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    render();
  });
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const list = app.querySelector('#projects');
  for (const project of projects) {
    const row = document.createElement('div'); row.className = 'project-row'; row.dataset.testid = 'project-row';
    const name = document.createElement('span'); name.className = 'project-name'; name.textContent = project.name;
    const open = document.createElement('button'); open.textContent = 'Open project'; open.addEventListener('click', () => { history.pushState({}, '', '/projects/' + project.id); render(); });
    row.append(name, open); list.append(row);
  }
}
addEventListener('popstate', render);
render();
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/health' && req.method === 'GET') return send(200, JSON.stringify({ status: 'ok' }));
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    return send(200, JSON.stringify(db.prepare('SELECT id, name FROM projects ORDER BY id').all()));
  }
  if (url.pathname === '/api/projects' && req.method === 'POST') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return send(400, JSON.stringify({ error: 'Project name is required' }));
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return send(201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
    } catch {
      return send(400, JSON.stringify({ error: 'Invalid request' }));
    }
  }
  if (req.method === 'GET') return send(200, page, 'text/html; charset=utf-8');
  send(404, JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0');
