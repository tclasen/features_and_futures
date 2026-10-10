import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  )
`);
const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
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
  <link rel="stylesheet" href="/styles.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map((project) => `
    <li data-testid="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button>Open project</button></form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/projects" method="post" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <ul aria-label="Projects">${rows}</ul>`);
}

function send(response, status, body, contentType = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #172a3a; background: #f4f7fa; }
  main { max-width: 760px; margin: 3rem auto; padding: 2rem; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; margin-bottom: .5rem; font-weight: 600; }
  .input-group { display: flex; gap: .75rem; flex-wrap: wrap; }
  input { flex: 1; min-width: 180px; border: 1px solid #667789; border-radius: 5px; padding: .7rem; font: inherit; }
  button { cursor: pointer; border: 0; border-radius: 5px; background: #225ca0; color: white; padding: .75rem 1rem; font: inherit; }
  button:hover { background: #174579; }
  :focus-visible { outline: 3px solid #e29c26; outline-offset: 3px; }
  ul { list-style: none; padding: 0; margin-top: 2rem; }
  li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #dce3ea; }
  li span { overflow-wrap: anywhere; min-width: 0; }
  li form { flex-shrink: 0; }
  [role="alert"] { color: #a01818; }
  @media (max-width: 600px) { main { margin: 1rem; padding: 1rem; } }
`;

const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (request.method === 'GET' && path === '/styles.css') {
      return send(response, 200, stylesheet, 'text/css; charset=utf-8');
    }
    if (request.method === 'GET' && path === '/') {
      return send(response, 200, projectsPage());
    }
    if (request.method === 'POST' && path === '/projects') {
      const form = await readForm(request);
      const name = (form.get('name') || '').trim();
      if (!name) return send(response, 400, projectsPage('Project name is required'));
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const match = path.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const id = Number(match[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        return send(response, 200, page(project.name, `
          <h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button>Projects</button></form>`));
      }
    }
    send(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) send(response, error.status || 500, 'Unable to complete request', 'text/plain; charset=utf-8');
    else response.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
