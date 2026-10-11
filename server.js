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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; flex: 1; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #aab5c2; border-radius: 6px; font: inherit; background: white; }
    button { padding: 10px 15px; border: 0; border-radius: 6px; background: #155eef; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #004eeb; }
    [role="alert"] { margin: 0 0 16px; color: #b42318; }
    #projects { display: grid; gap: 10px; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid #d0d5dd; border-radius: 8px; background: white; }
    [data-testid="project-row"] button { background: #344054; }
    .detail h1 { margin-bottom: 20px; }
    @media (max-width: 520px) { main { padding: 28px 16px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const escapePath = (id) => '/projects/' + encodeURIComponent(id);
    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    function renderList(projects) {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text'; input.name = 'projectName'; input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert'); alert.hidden = true;
      const list = document.createElement('section');
      list.id = 'projects';
      for (const project of projects) {
        const row = document.createElement('div');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span'); name.textContent = project.name;
        const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = escapePath(project.id); });
        row.append(name, open); list.append(row);
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!response.ok) { alert.textContent = 'Could not create project'; alert.hidden = false; return; }
        location.href = '/';
      });
      app.append(form, alert, list);
    }
    async function renderDetail(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { app.textContent = 'Project not found'; return; }
      const project = await response.json();
      const section = document.createElement('section'); section.className = 'detail';
      const heading = document.createElement('h1'); heading.textContent = project.name;
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      section.append(heading, back); app.replaceChildren(section);
    }
    const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) renderDetail(match[1]).catch(() => { app.textContent = 'Could not load project'; });
    else loadProjects().then(renderList).catch(() => { app.textContent = 'Could not load projects'; });
  </script>
</body>
</html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: String(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectMatch[1]);
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
