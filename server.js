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
  );
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
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
    :root { font-family: system-ui, sans-serif; color: #182c3b; background: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { font-size: 2.3rem; overflow-wrap: anywhere; }
    .card { background: white; padding: 24px; border: 1px solid #d8e1e7; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; padding: 12px; border: 1px solid #899ca9; border-radius: 6px; font: inherit; }
    button { padding: 12px 18px; border: 0; border-radius: 6px; background: #175b79; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #10465f; }
    :focus-visible { outline: 3px solid #c17400; outline-offset: 3px; }
    .projects { display: grid; gap: 12px; margin-top: 24px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .project span { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project form { flex-shrink: 0; }
    .empty { color: #516574; }
    [role="alert"] { color: #a12626; margin-top: 0; }
    @media (max-width: 480px) { main { margin-top: 32px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <section class="card" aria-label="Create a project">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/projects">
        <label for="project-name">Project name</label>
        <div class="controls">
          <input id="project-name" name="name" type="text">
          <button type="submit">Create project</button>
        </div>
      </form>
    </section>
    <section class="projects" aria-label="Projects">
      ${projects.length ? projects.map(project => `
        <div class="card project" data-testid="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
    </section>`);
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
        if (Buffer.byteLength(body) > 64 * 1024) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectMatch = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && projectMatch) {
      const project = findProject.get(projectMatch[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <form method="get" action="/"><button type="submit">Projects</button></form>
          <h1>${escapeHtml(project.name)}</h1>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><form action="/"><button>Projects</button></form>'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Server error', '<h1>Server error</h1>'));
    } else {
      response.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
