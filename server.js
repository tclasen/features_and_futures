import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    :root { font-family: system-ui, sans-serif; color: #172439; background: #f4f6fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 64px auto; padding: 28px; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #718096; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; background: #2454bc; color: white; border: 0; border-radius: 6px; font: inherit; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #e69619; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { list-style: none; padding: 0; margin-top: 28px; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #dee4ee; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a51c25; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function createApplication(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0)
  )`);
  const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
  const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

  function projectList(error = '', name = '') {
    const projects = listProjects.all();
    return page('Projects', `<h1>Workboard</h1>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form class="create" method="post" action="/projects">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" value="${escapeHtml(name)}">
        <button type="submit">Create project</button>
      </form>
      <ul class="projects">${projects.map(project => `<li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </li>`).join('')}</ul>`);
  }

  const server = http.createServer(async (request, response) => {
    const sendHtml = (status, html) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    };
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        sendHtml(200, projectList());
      } else if (request.method === 'POST' && pathname === '/projects') {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 64 * 1024) {
            sendHtml(413, page('Request too large', '<h1>Request too large</h1>'));
            return;
          }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const name = (new URLSearchParams(body).get('name') ?? '').trim();
        if (!name) {
          sendHtml(400, projectList('Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (!project) {
          sendHtml(404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
          return;
        }
        sendHtml(200, page(project.name, `<h1>${escapeHtml(project.name)}</h1><form method="get" action="/"><button type="submit">Projects</button></form>`));
      } else {
        sendHtml(404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      console.error(error);
      if (!response.headersSent) sendHtml(500, page('Server error', '<h1>Something went wrong</h1>'));
      else response.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApplication(process.env.DB_PATH || './data/workboard.sqlite');
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
    console.log(`Workboard listening on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
