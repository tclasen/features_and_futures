import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const allProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #18263b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 8px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin: 32px 0 12px; }
    .intro, .empty { color: #536278; }
    form.create { background: white; padding: 24px; border: 1px solid #d7dfe9; border-radius: 12px; margin-top: 28px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 11px 12px; border: 1px solid #8795a8; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 1px solid #224fc5; border-radius: 6px; background: #224fc5; color: white; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    button:hover { background: #183c9c; }
    :focus-visible { outline: 3px solid #b66600; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: white; border: 1px solid #d7dfe9; padding: 20px; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a21b20; margin: 12px 0 0; }
    .back { margin-bottom: 24px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .controls { flex-direction: column; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main>
<script>
  const form = document.querySelector('.create');
  if (form) form.addEventListener('submit', event => {
    const input = form.elements.name;
    if (!input.value.trim()) {
      event.preventDefault();
      document.getElementById('project-error').textContent = 'Project name is required';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });
</script>
</body></html>`;
}

function projectsPage(error = '', name = '') {
  const projects = allProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="controls"><input id="project-name" name="name" value="${escapeHtml(name)}" aria-describedby="project-error"${error ? ' aria-invalid="true"' : ''}>
      <button type="submit">Create project</button></div>
      <p id="project-error" role="alert">${escapeHtml(error)}</p>
    </form>
    <h2>Projects</h2>
    <div class="projects">${projects.map(project => `<div class="project" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`).join('')}</div>
    ${projects.length ? '' : '<p class="empty">No projects yet. Create your first project above.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, page(project.name, `<form class="back" method="get" action="/"><button type="submit">Projects</button></form><h1>${escapeHtml(project.name)}</h1>`));
    } else {
      sendHtml(response, 404, page('Page not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
