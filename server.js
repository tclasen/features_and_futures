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
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17243a; font: 17px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 12px; border: 1px solid #8392a8; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; background: #2357c5; color: white; border: 0; border-radius: 6px; font: inherit; cursor: pointer; }
    button:hover { background: #194497; }
    :focus-visible { outline: 3px solid #e29b15; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce2ec; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a21d2b; margin: 16px 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project-row { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map(project => `
    <div class="project-row" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && path === '/') {
      html(response, 200, projectsPage());
    } else if (request.method === 'POST' && path === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          html(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const project = findProject.get(path.split('/')[2]);
      if (!project) {
        html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1><form action="/" method="get"><button type="submit">Projects</button></form>`));
    } else {
      html(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('Error', '<h1>Something went wrong</h1>'));
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
