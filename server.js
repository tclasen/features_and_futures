import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #202b3d; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin: 0 0 28px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; font: inherit; padding: 11px 12px; border: 1px solid #8c99ab; border-radius: 6px; }
    button { font: inherit; font-weight: 600; padding: 11px 16px; color: white; background: #254fc1; border: 0; border-radius: 6px; cursor: pointer; }
    button:hover { background: #193b99; }
    :focus-visible { outline: 3px solid #dd9b00; outline-offset: 3px; }
    .projects { padding: 0; margin: 28px 0 0; list-style: none; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-top: 1px solid #dce2eb; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .empty { margin-top: 28px; color: #526077; }
    [role="alert"] { color: #a32121; margin: 16px 0 0; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px 18px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    ${projects.length ? `<ul class="projects">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet. Create your first project above.</p>'}
  `);
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    html(response, 404, page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>'));
  } catch (error) {
    console.error(error);
    html(response, 500, page('Error', '<h1>Unable to complete the request</h1>'));
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
