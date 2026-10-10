import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
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
const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

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
  <title>${escapeHtml(title)} | Workboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map((project) => `
    <li data-testid="project-row" class="project-row">
      <span>${escapeHtml(project.name)}</span>
      <form action="/projects/${project.id}" method="get">
        <button type="submit">Open project</button>
      </form>
    </li>`).join('');
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <label for="project-name">Project name</label>
      <div class="input-group">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <h2>Projects</h2>
    ${rows ? `<ul class="projects">${rows}</ul>` : '<p class="empty">No projects yet.</p>'}`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

const stylesheet = `
  :root { font-family: system-ui, sans-serif; color: #182b39; background: #f4f7fa; }
  body { margin: 0; }
  main { max-width: 760px; margin: 64px auto; padding: 32px; background: white;
    border: 1px solid #dce4ea; border-radius: 12px; }
  h1 { margin-top: 0; overflow-wrap: anywhere; }
  h2 { margin-top: 36px; font-size: 1.2rem; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  .input-group { display: flex; gap: 12px; }
  input, button { font: inherit; border-radius: 6px; padding: 10px 14px; }
  input { min-width: 0; flex: 1; border: 1px solid #8798a6; }
  button { border: 1px solid #205b9d; background: #205b9d; color: white; cursor: pointer; }
  button:hover { background: #174575; }
  :focus-visible { outline: 3px solid #cf7900; outline-offset: 3px; }
  .projects { padding: 0; list-style: none; }
  .project-row { display: flex; align-items: center; justify-content: space-between;
    gap: 20px; padding: 16px 0; border-bottom: 1px solid #dce4ea; }
  .project-row span { overflow-wrap: anywhere; min-width: 0; }
  .project-row button { white-space: nowrap; }
  [role="alert"] { color: #a32121; }
  .empty { color: #536574; }
  @media (max-width: 600px) {
    main { margin: 16px; padding: 20px; }
    .input-group { flex-direction: column; }
  }
`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/style.css') {
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
      let bodySize = 0;
      for await (const chunk of request) {
        bodySize += chunk.length;
        if (bodySize > 16384) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 422, projectsPage('Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
    if (request.method === 'GET' && projectRoute) {
      const id = Number(projectRoute[1]);
      const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
        return;
      }
    }
    sendHtml(response, 404, page('Not found', '<h1>Not found</h1><a href="/">Projects</a>'));
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
  console.log(`Workboard listening on http://0.0.0.0:${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
