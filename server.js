import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');
const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));

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
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <header><p class="eyebrow">Your project workspace</p><h1>Workboard</h1></header>
    <section class="panel" aria-labelledby="create-heading">
      <h2 id="create-heading">Create a project</h2>
      ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/projects">
        <label for="project-name">Project name</label>
        <div class="create-fields">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
    </section>
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      <div class="project-list">${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button class="secondary" type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet. Create your first project above.</p>'}
      </div>
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
    if (request.method === 'GET' && url.pathname === '/styles.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(stylesheet);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const name = (new URLSearchParams(Buffer.concat(chunks).toString()).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 200, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <form method="get" action="/"><button class="secondary" type="submit">Projects</button></form>
          <header><p class="eyebrow">Project</p><h1>${escapeHtml(project.name)}</h1></header>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, page('Server error', '<h1>Unable to complete the request</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
