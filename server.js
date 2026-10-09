import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const stylesheet = readFileSync(new URL('./public/style.css', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)} · Workboard</title><link rel="stylesheet" href="/style.css">
    </head><body><main>${body}</main></body></html>`;
}

function projectsPage(error = '') {
  const rows = listProjects.all().map(project => `
    <li data-testid="project-row" class="project-row">
      <span>${escape(project.name)}</span>
      <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
    </li>`).join('');
  return page('Projects', `<h1>Workboard</h1>
    <form action="/projects" method="post" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-group"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <h2>Projects</h2>
    ${rows ? `<ul class="project-list">${rows}</ul>` : '<p class="empty">No projects yet. Create a project to get started.</p>'}`);
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    }
    if (req.method === 'GET' && path === '/style.css') {
      return send(res, 200, stylesheet, 'text/css; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/') return send(res, 200, projectsPage());
    if (req.method === 'POST' && path === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          return send(res, 413, page('Request too large', '<h1>Request too large</h1>'));
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) return send(res, 400, projectsPage('Project name is required'));
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    const match = /^\/projects\/(\d+)$/.exec(path);
    if (req.method === 'GET' && match) {
      const project = getProject.get(match[1]);
      if (project) return send(res, 200, page(project.name, `
        <form action="/" method="get"><button type="submit">Projects</button></form>
        <h1>${escape(project.name)}</h1>`));
    }
    send(res, 404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
  } catch (error) {
    console.error(error);
    send(res, 500, page('Error', '<h1>Something went wrong</h1>'));
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
