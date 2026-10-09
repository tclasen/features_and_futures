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
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17233b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 32px #17233b0a; }
    h1 { margin: 0 0 28px; font-size: 32px; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    .create-controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8390a6; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #234edb; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #173bb0; }
    :focus-visible { outline: 3px solid #d98400; outline-offset: 3px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-top: 1px solid #e1e5ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a22222; margin-top: 12px; }
    .empty { color: #56637a; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-controls { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = listProjects.all();
  return page(`<h1>Workboard</h1>
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="name-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
      ${error ? `<div id="name-error" role="alert">${escapeHtml(error)}</div>` : ''}
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok' }));
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return html(response, 200, projectList());
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024) {
          return html(response, 413, page('<h1>Request too large</h1>'));
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) return html(response, 400, projectList('Project name is required'));
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) return html(response, 200, page(`<h1>${escapeHtml(project.name)}</h1>
        <form method="get" action="/"><button type="submit">Projects</button></form>`));
    }
    html(response, 404, page('<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Unable to complete request</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
