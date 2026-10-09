import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY position');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)');

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
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #202d41; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 32px; overflow-wrap: anywhere; }
    .card { background: white; padding: 24px; border: 1px solid #d9e0eb; border-radius: 10px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 12px; border: 1px solid #8c99ac; border-radius: 6px; font: inherit; margin-bottom: 16px; }
    button { background: #264ec7; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; cursor: pointer; }
    button:hover { background: #183ca9; }
    :focus-visible { outline: 3px solid #ed9f23; outline-offset: 3px; }
    [role="alert"] { color: #9e1a24; margin: 0 0 16px; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .empty { color: #5b687b; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="card" action="/projects" method="post">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `
        <div class="card project" data-testid="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </section>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
      sendHtml(res, 200, projectList());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536) {
          sendHtml(res, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(res, 400, projectList('Project name is required'));
        return;
      }
      insertProject.run(randomUUID(), name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const match = url.pathname.match(/^\/projects\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        sendHtml(res, 200, page(project.name, `
          <h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, 500, page('Server error', '<h1>Server error</h1>'));
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
