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

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172b42; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; letter-spacing: -1px; overflow-wrap: anywhere; }
    .intro { color: #526174; margin-bottom: 32px; }
    .panel, .project { background: white; border: 1px solid #dce2eb; border-radius: 12px; padding: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8492a6; border-radius: 6px; padding: 12px; font: inherit; }
    button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 12px 18px; background: #234fc4; color: white; cursor: pointer; }
    button:hover { background: #193c99; }
    :focus-visible { outline: 3px solid #b36b00; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .empty { color: #526174; }
    [role="alert"] { color: #9c2222; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .fields, .project { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form class="panel" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map((project) => `<div class="project" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && path === '/') {
      html(res, 200, projectsPage());
    } else if (req.method === 'POST' && path === '/projects') {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(res, 422, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(res, 200, page(project.name, `<form action="/" method="get"><button type="submit">Projects</button></form><h1>${escapeHtml(project.name)}</h1>`));
      } else {
        html(res, 404, page('Project not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
      }
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
