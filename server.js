import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
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

function page(content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #192b40; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 48px auto; padding: 24px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, button { font: inherit; padding: 10px 14px; border-radius: 6px; }
    input { border: 1px solid #8896a8; max-width: 100%; box-sizing: border-box; }
    button { background: #234fa3; color: white; border: 1px solid #234fa3; cursor: pointer; }
    button:hover { background: #183c80; }
    :focus-visible { outline: 3px solid #e09817; outline-offset: 3px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px;
      padding: 18px; margin-top: 12px; border: 1px solid #d7dee8; border-radius: 8px; background: white; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role=alert] { color: #a51e25; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '', enteredName = '') {
  const projects = listProjects.all();
  return page(`<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="create">
        <input id="project-name" name="name" value="${escapeHtml(enteredName)}" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <section aria-label="Projects">
      ${projects.map(project => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </section>`);
}

function html(response, status, content) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && path === '/') {
      html(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && path === '/projects') {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 64 * 1024) {
          html(response, 413, page('<h1>Request too large</h1>'));
          return;
        }
      }
      const enteredName = new URLSearchParams(body).get('name') || '';
      const name = enteredName.trim();
      if (!name) {
        html(response, 200, projectList('Project name is required', enteredName));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = /^\/projects\/(\d+)$/.exec(path);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        html(response, 200, page(`<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    html(response, 404, page('<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    html(response, 500, page('<h1>Something went wrong</h1>'));
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
