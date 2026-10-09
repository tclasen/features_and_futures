import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.DB_PATH || 'data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
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
const stylesheet = readFileSync(new URL('./public/style.css', import.meta.url));

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
  <link rel="stylesheet" href="/style.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '', enteredName = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <p class="eyebrow">Your project workspace</p>
    <h1>Workboard</h1>
    <form class="create-form" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" value="${escapeHtml(enteredName)}">
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p role="alert" class="error">${escapeHtml(error)}</p>` : ''}
    </form>
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      ${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit" class="secondary">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">Create your first project to get started.</p>'}
    </section>`);
}

function send(response, status, body, type = 'text/html; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type });
  response.end(body);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('Form is too large');
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
      return send(response, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (request.method === 'GET' && pathname === '/style.css') {
      return send(response, 200, stylesheet, 'text/css; charset=utf-8');
    }
    if (request.method === 'GET' && pathname === '/') {
      return send(response, 200, projectsPage());
    }
    if (request.method === 'POST' && pathname === '/projects') {
      const form = await readForm(request);
      const enteredName = form.get('name') || '';
      const name = enteredName.trim();
      if (!name) {
        return send(response, 422, projectsPage('Project name is required', enteredName));
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      return response.end();
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      if (project) {
        return send(response, 200, page(project.name, `
          <form action="/" method="get"><button class="secondary">Projects</button></form>
          <h1>${escapeHtml(project.name)}</h1>`));
      }
    }
    send(response, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    send(response, error.status || 500, page('Error', '<h1>Unable to process request</h1>'));
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
