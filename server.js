import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
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
    body { margin: 0; background: #f4f6fa; color: #182339; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dbe1ec; border-radius: 16px; }
    h1 { margin: 0 0 24px; font-size: 32px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin-top: 32px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    input { flex: 1; min-width: 0; padding: 11px 12px; border: 1px solid #8794a9; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 1px solid #244cc0; border-radius: 6px; background: #244cc0; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193b9c; }
    :focus-visible { outline: 3px solid #e3a42e; outline-offset: 3px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-bottom: 1px solid #dbe1ec; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { padding: 12px; margin-bottom: 16px; background: #fff0ef; color: #9b201b; border-radius: 6px; }
    .empty { color: #53627a; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<div role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-fields"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <h2>Projects</h2>
    ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}`);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return html(res, 200, projectsPage());
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          return html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) return html(res, 200, projectsPage('Project name is required'));
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (project) return html(res, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1><form method="get" action="/"><button type="submit">Projects</button></form>`));
    }
    html(res, 404, page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>'));
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
