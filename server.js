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
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #17233b; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; }
    h1 { font-size: 2rem; overflow-wrap: anywhere; }
    .panel, .project-row { background: white; border: 1px solid #d9e0eb; border-radius: 10px; padding: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; border: 1px solid #8794ab; border-radius: 6px; padding: 11px; font: inherit; }
    button { background: #2456b5; color: white; border: 0; border-radius: 6px; padding: 12px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194391; }
    :focus-visible { outline: 3px solid #e29116; outline-offset: 3px; }
    [role="alert"] { color: #a51a26; margin-top: 0; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    @media (max-width: 500px) { main { margin: 20px auto; padding: 16px; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function home(error = '') {
  const rows = listProjects.all().map(project => `
    <div class="project-row" data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form class="panel" action="/projects" method="post">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls"><input id="project-name" name="name" type="text" autocomplete="off"><button type="submit">Create project</button></div>
    </form>
    <section class="projects" aria-label="Projects">${rows}</section>`);
}

function html(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, home());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(res, 200, home('Project name is required'));
        return;
      }
      addProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) {
        html(res, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    html(res, 404, page('Not found', '<h1>Not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
