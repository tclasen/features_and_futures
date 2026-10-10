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
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f7fb; color: #17243b; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 56px auto; padding: 28px; }
  h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
  form, .project-row { background: white; border: 1px solid #d7deea; border-radius: 10px; padding: 20px; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  .inputs { display: flex; flex-wrap: wrap; gap: 12px; }
  input { flex: 1; min-width: 180px; border: 1px solid #78859a; border-radius: 5px; padding: 10px; font: inherit; }
  button { border: 0; border-radius: 5px; background: #2255ba; color: white; padding: 10px 16px; font: inherit; cursor: pointer; }
  button:hover { background: #163e8f; }
  :focus-visible { outline: 3px solid #c26800; outline-offset: 3px; }
  .project-list { display: grid; gap: 12px; margin-top: 24px; }
  .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .project-row span { overflow-wrap: anywhere; min-width: 0; }
  .project-row form { border: 0; padding: 0; flex-shrink: 0; }
  [role="alert"] { color: #a11d1d; font-weight: 600; }
  @media (max-width: 520px) { main { margin: 20px auto; padding: 16px; } .project-row { flex-wrap: wrap; } }
</style></head><body><main>${content}</main></body></html>`;
}

function projectList(error = '', enteredName = '') {
  const rows = listProjects.all().map(project => `<div class="project-row" data-testid="project-row">
    <span>${escapeHtml(project.name)}</span>
    <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
  </div>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="inputs"><input id="project-name" name="name" value="${escapeHtml(enteredName)}"><button type="submit">Create project</button></div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <section class="project-list" aria-label="Projects">${rows || '<p>No projects yet.</p>'}</section>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024 * 1024) {
          sendHtml(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const enteredName = new URLSearchParams(body).get('name') || '';
      const name = enteredName.trim();
      if (!name) {
        sendHtml(res, 400, projectList('Project name is required', enteredName));
        return;
      }
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(res, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1><form action="/" method="get"><button type="submit">Projects</button></form>`));
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, 500, page('Error', '<h1>Something went wrong</h1>'));
    else res.end();
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
