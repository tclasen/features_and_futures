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
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f7fb; color: #17243b; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: 64px auto; padding: 24px; }
  h1 { margin-top: 0; }
  form { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 32px; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  input, button { font: inherit; border-radius: 6px; padding: 10px 14px; }
  input { border: 1px solid #8895a7; width: min(320px, 100%); }
  button { border: 1px solid #245ac5; background: #245ac5; color: white; cursor: pointer; }
  button:hover { background: #19469c; }
  :focus-visible { outline: 3px solid #d58d00; outline-offset: 3px; }
  .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 18px; margin: 12px 0; background: white; border: 1px solid #d6dce6; border-radius: 8px; }
  .project-row span, h1 { overflow-wrap: anywhere; }
  .project-row form { margin: 0; flex-shrink: 0; }
  [role="alert"] { color: #a11919; padding: 12px; border: 1px solid #a11919; border-radius: 6px; }
</style></head><body><main>${content}</main></body></html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map(project => `
    <div class="project-row" data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </div>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div>
      <button type="submit">Create project</button>
    </form>
    <section aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, projectsPage());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          html(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(res, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        html(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(res, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
        <form method="get" action="/"><button type="submit">Projects</button></form>`));
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
