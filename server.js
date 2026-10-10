import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #19253b; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 16px; }
    h1 { margin: 0 0 24px; font-size: 32px; overflow-wrap: anywhere; }
    h2 { margin-top: 32px; font-size: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8a98ad; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 11px 16px; background: #254ec4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193a9c; }
    :focus-visible { outline: 3px solid #bc6a00; outline-offset: 3px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dde3ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a32121; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #59687e; }
    @media (max-width: 540px) { main { margin: 16px; padding: 20px; } .create { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <section aria-labelledby="projects-heading"><h2 id="projects-heading">Projects</h2>
    ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`).join('') : '<p class="empty">No projects yet.</p>'}
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
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = new URLSearchParams(body).get('name')?.trim() || '';
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const id = Number(projectMatch[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
