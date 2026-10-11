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
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #182438; font: 16px system-ui, sans-serif; }
    main { max-width: 760px; margin: 48px auto; padding: 28px; background: white; border-radius: 12px; box-shadow: 0 4px 20px #1824380d; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .fields { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; border: 1px solid #8795a8; border-radius: 6px; padding: 10px; font: inherit; }
    button { background: #2455b8; color: white; border: 0; border-radius: 6px; padding: 11px 16px; font: inherit; cursor: pointer; }
    :focus-visible { outline: 3px solid #d28c16; outline-offset: 3px; }
    ul { padding: 0; list-style: none; margin: 28px 0 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #e0e6ee; padding: 16px 0; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    li form { flex-shrink: 0; }
    [role="alert"] { color: #a22121; background: #fff0f0; padding: 12px; border-radius: 6px; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = listProjects.all();
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="fields"><input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button></div>
    </form>
    <ul>${projects.map(project => `<li data-testid="project-row">
      <span class="project-name">${escapeHtml(project.name)}</span>
      <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
    </li>`).join('')}</ul>`);
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
      sendHtml(response, 200, projectList());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        chunks.push(chunk);
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          sendHtml(response, 413, page('Request too large', '<h1>Request too large</h1>'));
          return;
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) {
        sendHtml(response, 400, projectList('Project name is required'));
        return;
      }
      createProject.run(name);
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    const match = url.pathname.match(/^\/projects\/([1-9]\d*)$/);
    if (request.method === 'GET' && match) {
      const project = findProject.get(match[1]);
      if (project) {
        sendHtml(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form method="get" action="/"><button type="submit">Projects</button></form>`));
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
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
