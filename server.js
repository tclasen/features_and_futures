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
const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Workboard</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6fa; color: #182539; font-family: system-ui, sans-serif; }
main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
h1 { margin-top: 0; } h2 { font-size: 1.2rem; margin-top: 32px; }
label { display: block; font-weight: 600; margin-bottom: 8px; }
input { padding: 10px; font: inherit; border: 1px solid #8795a9; border-radius: 6px; width: 100%; }
button { padding: 10px 16px; font: inherit; font-weight: 600; color: white; background: #245bc0; border: 0; border-radius: 6px; cursor: pointer; }
button:hover { background: #194695; } :focus-visible { outline: 3px solid #a64d00; outline-offset: 3px; }
.create { display: flex; gap: 12px; align-items: end; } .field { flex: 1; }
.project { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dce2eb; }
.project span { overflow-wrap: anywhere; min-width: 0; } .project form { flex-shrink: 0; }
[role=alert] { color: #a31919; font-weight: 600; }
@media (max-width: 540px) { main { margin: 16px; padding: 20px; } .create { flex-direction: column; align-items: stretch; } }
</style></head><body><main>${body}</main></body></html>`;
}

function projectList(error = '', name = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form class="create" method="post" action="/projects">
<div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" value="${escape(name)}"></div>
<button type="submit">Create project</button></form>
<h2>Projects</h2>
${projects.length ? projects.map(project => `<div class="project" data-testid="project-row"><span>${escape(project.name)}</span><form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form></div>`).join('') : '<p>No projects yet.</p>'}`);
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
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
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
        html(res, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, page(project.name, `<h1>${escape(project.name)}</h1><form action="/" method="get"><button type="submit">Projects</button></form>`));
    } else {
      html(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) html(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
