import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182b3b; background: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 36px; margin: 0 0 28px; overflow-wrap: anywhere; }
    h2 { font-size: 20px; margin: 32px 0 16px; }
    .create { padding: 24px; background: white; border: 1px solid #d7e0e6; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input { min-width: 0; flex: 1 1 240px; padding: 12px; border: 1px solid #8495a3; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #175d84; color: white; cursor: pointer; font: inherit; font-weight: 600; }
    button:hover { background: #104663; }
    :focus-visible { outline: 3px solid #ce8700; outline-offset: 3px; }
    [role="alert"] { color: #9b2424; margin: 0 0 16px; }
    ul { padding: 0; margin: 0; list-style: none; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: white; padding: 20px; margin-bottom: 12px; border: 1px solid #d7e0e6; border-radius: 10px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    .empty { color: #526775; }
    @media (max-width: 480px) { main { margin-top: 32px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" method="post" action="/projects">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="fields">
        <input id="project-name" name="name" type="text" autocomplete="off"${error ? ' aria-invalid="true"' : ''}>
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    ${projects.length ? `<ul>${projects.map(project => `
      <li class="project" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet. Create your first project above.</p>'}
  `);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
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
      sendHtml(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        chunks.push(chunk);
        bytes += chunk.length;
        if (bytes > 1_048_576) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectList('Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match && Number.isSafeInteger(Number(match[1]))) {
      const project = findProject.get(Number(match[1]));
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button type="submit">Projects</button></form>
        `));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    else response.end();
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
