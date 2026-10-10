import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fa; color: #17243a; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dde3ed; border-radius: 16px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create-fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; padding: 12px; border: 1px solid #8795ab; border-radius: 6px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 18px; background: #284dcc; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #193ba9; }
    :focus-visible { outline: 3px solid #e69b12; outline-offset: 3px; }
    .projects { margin-top: 32px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 0; border-top: 1px solid #dde3ed; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a51a23; background: #fff0f0; padding: 12px; border-radius: 6px; }
    .empty { color: #5d6a80; }
    @media (max-width: 600px) { main { margin: 20px 12px; padding: 24px; } .create-fields { flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-fields">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <div class="projects">
      ${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">Your projects will appear here.</p>'}
    </div>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = getProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Server error', '<h1>Something went wrong</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
