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

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workboard</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #182434; background: #f4f6fa; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  input { width: 100%; padding: 12px; font: inherit; border: 1px solid #8c98aa; border-radius: 6px; }
  button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #285ac8; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #1945a7; }
  :focus-visible { outline: 3px solid #edac28; outline-offset: 3px; }
  .create button { margin-top: 12px; }
  .projects { margin-top: 32px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dce2eb; padding: 16px 0; }
  .name { overflow-wrap: anywhere; min-width: 0; }
  .row form { flex-shrink: 0; }
  [role=alert] { color: #a21725; background: #fff0f1; padding: 12px; border-radius: 6px; }
  @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectList(error = '', name = '') {
  const rows = listProjects.all().map(project => `<div class="row" data-testid="project-row">
    <span class="name">${escape(project.name)}</span>
    <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
  </div>`).join('');
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" value="${escape(name)}">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
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
      return html(res, 200, projectList());
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024) {
          return html(res, 413, page('<h1>Request too large</h1>'));
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) return html(res, 422, projectList('Project name is required'));
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    const match = url.pathname.match(/^\/projects\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) return html(res, 200, page(`<h1>${escape(project.name)}</h1>
        <form action="/" method="get"><button type="submit">Projects</button></form>`));
    }
    html(res, 404, page('<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
