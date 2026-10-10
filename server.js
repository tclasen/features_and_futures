import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DB_PATH ?? 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  );
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #19283c; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2eb; border-radius: 12px; }
    h1 { margin-top: 0; font-size: 32px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { min-width: 0; width: 100%; padding: 11px; border: 1px solid #8996a8; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 0; border-radius: 6px; background: #244fba; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193b91; }
    :focus-visible { outline: 3px solid #e99f1b; outline-offset: 3px; }
    .create-controls { display: flex; gap: 12px; }
    .create-controls button { flex-shrink: 0; }
    .project-list { list-style: none; padding: 0; margin: 28px 0 0; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-top: 1px solid #dce2eb; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a21c20; margin: 16px 0; }
    .empty { color: #556478; margin-top: 28px; }
    @media (max-width: 560px) { main { margin: 20px 12px; padding: 24px; } .create-controls { flex-direction: column; } }
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
      <div class="create-controls">
        <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${projects.length ? `<ul class="project-list" aria-label="Projects">${projects.map(project => `
      <li class="project-row" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && pathname === '/') {
      sendHtml(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') ?? '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
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
    sendHtml(response, error.status ?? 500, page('Error', '<h1>Unable to process request</h1>'));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
