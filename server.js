import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const db = new DatabaseSync(process.env.DB_PATH || './workboard.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #192331; background: #f4f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 48px 20px; }
    main { max-width: 720px; margin: auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form, .project-row { display: flex; align-items: center; gap: 12px; }
    form { margin-bottom: 24px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #aeb8c4; border-radius: 6px; font: inherit; }
    button { padding: 10px 14px; border: 0; border-radius: 6px; background: #2459a6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194783; }
    .project-row { justify-content: space-between; padding: 14px 16px; margin: 10px 0; border: 1px solid #d8dee6; border-radius: 8px; background: white; }
    .project-name { font-weight: 600; }
    [role="alert"] { color: #a12622; margin: 0 0 16px; }
    .back { margin-bottom: 20px; }
    @media (max-width: 480px) { form { align-items: stretch; flex-direction: column; } form button { width: 100%; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    async function showProjects() {
      const projects = await fetch('/api/projects').then((response) => response.json());
      app.innerHTML = '<h1>Workboard</h1><form id="create-form"><label for="project-name">Project name</label><input id="project-name" name="name" type="text"><button type="submit">Create project</button></form><p id="error" role="alert" hidden></p><section aria-label="Projects">' + projects.map((project) => '<div class="project-row" data-testid="project-row"><span class="project-name">' + escapeHtml(project.name) + '</span><button type="button" data-project-id="' + project.id + '">Open project</button></div>').join('') + '</section>';
      app.querySelector('#create-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = app.querySelector('#project-name').value.trim();
        if (!name) { const error = app.querySelector('#error'); error.textContent = 'Project name is required'; error.hidden = false; return; }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (response.ok) showProjects();
      });
      app.querySelectorAll('[data-project-id]').forEach((button) => button.addEventListener('click', () => { location.href = '/projects/' + button.dataset.projectId; }));
    }
    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { history.replaceState(null, '', '/'); showProjects(); return; }
      const project = await response.json();
      document.title = project.name + ' · Workboard';
      app.innerHTML = '<button class="back" type="button">Projects</button><h1>' + escapeHtml(project.name) + '</h1>';
      app.querySelector('.back').addEventListener('click', () => { location.href = '/'; });
    }
    const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) showProject(match[1]); else showProjects();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(response, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const data = await readJson(request);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
