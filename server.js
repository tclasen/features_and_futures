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
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
    body { margin: 0; background: #f4f6fa; color: #18243b; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 4px 24px #18243b0c; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input { width: 100%; padding: 12px; border: 1px solid #7c879a; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #244ab5; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #183788; }
    :focus-visible { outline: 3px solid #e59115; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #e0e5ed; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { padding: 12px; background: #fff0f0; color: #a11919; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 24px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', name = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escapeHtml(name)}">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `<div class="project-row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('') : '<p>No projects yet.</p>'}
    </section>`);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024 * 1024) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(res, 422, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = getProject.get(Number(url.pathname.split('/')[2]));
      if (project) {
        html(res, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
      } else {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/" method="get"><button>Projects</button></form>'));
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

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
