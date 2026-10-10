import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #18283c; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    .brand { color: #52647d; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-size: 36px; margin: 12px 0 28px; overflow-wrap: anywhere; }
    .panel { padding: 24px; border: 1px solid #dce3ed; border-radius: 14px; background: white; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; font: inherit; padding: 12px; border: 1px solid #aab7c8; border-radius: 7px; }
    button { font: inherit; font-weight: 600; cursor: pointer; padding: 12px 18px; border: 1px solid #254dc4; border-radius: 7px; background: #254dc4; color: white; }
    button:hover { background: #19399b; }
    :focus-visible { outline: 3px solid #e69422; outline-offset: 3px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { font-size: 18px; font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .secondary { background: white; color: #254dc4; }
    .secondary:hover { background: #eef2ff; }
    .empty { color: #52647d; text-align: center; padding: 24px; }
    [role="alert"] { color: #9e2424; background: #fff1f1; padding: 12px; border-radius: 7px; margin-bottom: 16px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields { flex-direction: column; } .panel { padding: 18px; } .project-row { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', value = '') {
  const projects = listProjects.all();
  return page('Projects', `<div class="brand">Your workspace</div><h1>Workboard</h1>
    <section class="panel" aria-label="Create a project">
      ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/projects">
        <label for="project-name">Project name</label>
        <div class="fields"><input id="project-name" name="name" type="text" value="${escapeHtml(value)}"><button type="submit">Create project</button></div>
      </form>
    </section>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `<div class="panel project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button class="secondary" type="submit">Open project</button></form>
      </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
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
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const submittedName = new URLSearchParams(body).get('name') || '';
      const name = submittedName.trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required', submittedName));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `<div class="brand">Workboard</div><h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button class="secondary" type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
