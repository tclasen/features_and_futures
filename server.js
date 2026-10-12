import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? './data/workboard.sqlite';
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

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
    :root { font-family: system-ui, sans-serif; color: #18293a; background: #f4f6f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 12px 0 32px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin-top: 36px; }
    .eyebrow { color: #52657a; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
    .create-form { padding: 24px; background: white; border: 1px solid #dce3eb; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 10px; }
    .controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 12px; border: 1px solid #94a3b8; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 1px solid #2456ae; border-radius: 6px; background: #2456ae; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1b438c; }
    :focus-visible { outline: 3px solid #e99d27; outline-offset: 3px; }
    [role="alert"] { color: #a22424; margin: 0 0 16px; }
    .project-list { list-style: none; padding: 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; margin-bottom: 12px; background: white; border: 1px solid #dce3eb; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .empty { color: #52657a; }
    @media (max-width: 520px) { main { margin-top: 32px; } .controls { flex-direction: column; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <p class="eyebrow">Your workspace</p>
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    ${projects.length ? `<ul class="project-list">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet. Create a project to get started.</p>'}
  `);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let bodySize = 0;
      for await (const chunk of request) {
        bodySize += chunk.length;
        if (bodySize > 1_048_576) {
          html(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') ?? '').trim();
      if (!name) {
        html(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
      if (!project) {
        html(response, 404, page('Project not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      html(response, 200, page(project.name, `
        <form action="/" method="get"><button type="submit">Projects</button></form>
        <h1>${escapeHtml(project.name)}</h1>
      `));
    } else {
      html(response, 404, page('Not found', '<h1>Not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) html(response, 500, page('Server error', '<h1>Server error</h1>'));
    else response.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
