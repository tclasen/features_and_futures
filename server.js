import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

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
  <title>${escapeHtml(title)} — Workboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map(project => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-row">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <ul class="projects">${rows}</ul>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #202c3e; background: #f5f7fb; }
  body { margin: 0; }
  main { max-width: 760px; margin: 60px auto; padding: 24px; }
  h1 { font-size: 2.2rem; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  .input-row { display: flex; gap: 12px; flex-wrap: wrap; }
  input { flex: 1; min-width: 160px; padding: 12px; border: 1px solid #8794a8; border-radius: 6px; font: inherit; }
  button { padding: 12px 18px; border: 0; border-radius: 6px; background: #244ecb; color: white; font: inherit; cursor: pointer; }
  button:hover { background: #18399b; }
  :focus-visible { outline: 3px solid #996200; outline-offset: 3px; }
  .projects { padding: 0; list-style: none; margin-top: 30px; }
  .projects li { display: flex; justify-content: space-between; align-items: center; gap: 20px; background: white; padding: 18px; margin-bottom: 12px; border: 1px solid #dce2ec; border-radius: 8px; }
  .projects span { overflow-wrap: anywhere; min-width: 0; }
  .projects form { flex-shrink: 0; }
  [role=alert] { color: #a11919; }
`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end(stylesheet);
    } else if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, projectsPage());
    } else if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        chunks.push(chunk);
        size += chunk.length;
        if (size > 64 * 1024) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 200, projectsPage('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
    } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (!project) {
        sendHtml(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(response, 200, page(project.name, `
        <h1>${escapeHtml(project.name)}</h1>
        <form action="/" method="get"><button type="submit">Projects</button></form>`));
    } else {
      sendHtml(response, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendHtml(response, 500, page('Error', '<h1>Something went wrong</h1>'));
    } else {
      response.end();
    }
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
