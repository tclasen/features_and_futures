import { createServer } from 'node:http';
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
    body { margin: 0; background: #f5f7fb; color: #172338; font: 16px system-ui, sans-serif; }
    main { max-width: 720px; margin: 64px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input { width: 100%; padding: 12px; border: 1px solid #738097; border-radius: 6px; font: inherit; }
    button { padding: 11px 16px; border: 1px solid #284c9c; border-radius: 6px; background: #284c9c; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #1b3879; }
    :focus-visible { outline: 3px solid #d68400; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 12px 0; padding: 20px; background: white; border: 1px solid #d6deeb; border-radius: 8px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a51d26; margin: 12px 0; }
    .empty { color: #516079; }
    @media (max-width: 480px) { main { margin-top: 20px; } .project-row { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main>
<script>
  if (document.querySelector('[role="alert"]')) document.getElementById('project-name')?.focus();
</script>
</body></html>`;
}

function projectsPage(error = '') {
  const projects = listProjects.all();
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text"${error ? ' aria-invalid="true" aria-describedby="project-error"' : ''}>
      ${error ? `<p id="project-error" role="alert">${escapeHtml(error)}</p>` : ''}
      <button type="submit">Create project</button>
    </form>
    <section aria-label="Projects">
      <h2>Projects</h2>
      ${projects.length ? projects.map(project => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        </div>`).join('') : '<p class="empty">No projects yet. Create one to get started.</p>'}
    </section>`);
}

function sendHtml(response, status, html) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
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
        sendHtml(response, 200, projectsPage('Project name is required'));
        return;
      }
      insertProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const projectRoute = /^\/projects\/([1-9]\d*)$/.exec(pathname);
    if (request.method === 'GET' && projectRoute) {
      const project = findProject.get(projectRoute[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `
          <form action="/" method="get"><button type="submit">Projects</button></form>
          <h1>${escapeHtml(project.name)}</h1>`));
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

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
