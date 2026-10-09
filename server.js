import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databasePath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f5f7fa; color: #182333; margin: 0; }
    main { max-width: 720px; margin: 48px auto; padding: 24px; }
    h1 { overflow-wrap: anywhere; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    input, button { font: inherit; padding: 10px 14px; border-radius: 6px; }
    input { border: 1px solid #718096; max-width: 100%; box-sizing: border-box; }
    button { border: 1px solid #234a91; background: #234a91; color: white; cursor: pointer; }
    button:hover { background: #16386f; }
    :focus-visible { outline: 3px solid #c47500; outline-offset: 3px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; background: white; border: 1px solid #cbd3df; border-radius: 8px; margin: 12px 0; }
    .project-name { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    [role="alert"] { color: #a01c25; }
    .create-controls { display: flex; gap: 8px; flex-wrap: wrap; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function projectList(error = '') {
  const projects = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/projects">
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <section aria-label="Projects">
      ${projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('')}
    </section>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

async function readForm(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    bytes += chunk.length;
    if (bytes > 64 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, projectList());
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const form = await readForm(req);
      const name = (form.get('name') || '').trim();
      if (!name) {
        sendHtml(res, 200, projectList('Project name is required'));
        return;
      }
      db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[2]);
      const project = Number.isSafeInteger(id)
        ? db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id)
        : undefined;
      if (!project) {
        sendHtml(res, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
        return;
      }
      sendHtml(res, 200, page(project.name, `
        <h1>${escapeHtml(project.name)}</h1>
        <form method="get" action="/"><button type="submit">Projects</button></form>`));
    } else {
      sendHtml(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendHtml(res, error.status || 500, page('Error', '<h1>Unable to complete request</h1>'));
    } else {
      res.end();
    }
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
