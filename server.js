import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = process.env.DB_PATH || 'workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17263d; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input { font: inherit; padding: 10px 12px; border: 1px solid #8593a8; border-radius: 6px; width: 100%; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 6px; padding: 10px 16px; color: white; background: #2459b8; }
    button:hover { background: #18438f; }
    :focus-visible { outline: 3px solid #db8c12; outline-offset: 3px; }
    .create { display: grid; gap: 12px; margin-bottom: 32px; }
    .create button { justify-self: start; }
    .project { display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid #dce2eb; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a32323; margin: 0 0 16px; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 20px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <div><label for="project-name">Project name</label><input id="project-name" name="name" type="text"></div>
      <button type="submit">Create project</button>
    </form>
    <section aria-label="Projects">${listProjects.all().map(project => `
      <div class="project" data-testid="project-row">
        <span>${escape(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('')}</section>`);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && pathname === '/') {
      html(response, 200, projectsPage());
    } else if (request.method === 'POST' && pathname === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          html(response, 413, page('<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(response, 200, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/[1-9]\d*$/.test(pathname)) {
      const id = Number(pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        html(response, 200, page(`<h1>${escape(project.name)}</h1><form action="/" method="get"><button type="submit">Projects</button></form>`));
      } else {
        html(response, 404, page('<h1>Project not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>'));
      }
    } else {
      html(response, 404, page('<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('<h1>Unable to complete request</h1>'));
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
