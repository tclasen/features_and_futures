import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title>
<style>
  body { font-family: system-ui, sans-serif; color: #172438; background: #f4f6fa; margin: 0; }
  main { max-width: 720px; margin: 48px auto; padding: 24px; background: white; border-radius: 12px; }
  h1 { margin-top: 0; }
  label { display: block; margin-bottom: 8px; font-weight: 600; }
  input, button { font: inherit; padding: 10px 14px; border-radius: 6px; }
  input { border: 1px solid #8794a8; max-width: 100%; box-sizing: border-box; }
  button { background: #244db2; color: white; border: 0; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 3px solid #e59e16; outline-offset: 3px; }
  .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #dbe1eb; }
  .project-name { overflow-wrap: anywhere; min-width: 0; }
  .project-row form { flex-shrink: 0; }
  [role="alert"] { color: #a01616; }
  @media (max-width: 600px) { main { margin: 16px; } }
</style></head><body><main>${content}</main></body></html>`;
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

export function createApplication(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

  function projectsPage(error = '') {
    const rows = listProjects.all().map(project => `
      <div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
      </div>`).join('');
    return page('Projects', `<h1>Workboard</h1>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <form action="/projects" method="post">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </form>
      <section aria-label="Projects">${rows}</section>`);
  }

  function html(response, status, content) {
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(content);
  }

  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else if (request.method === 'GET' && pathname === '/') {
        html(response, 200, projectsPage());
      } else if (request.method === 'POST' && pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        if (!name) {
          html(response, 422, projectsPage('Project name is required'));
          return;
        }
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        response.end();
      } else if (request.method === 'GET' && /^\/projects\/\d+$/.test(pathname)) {
        const id = Number(pathname.split('/')[2]);
        const project = Number.isSafeInteger(id) ? getProject.get(id) : undefined;
        if (!project) {
          html(response, 404, page('Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>'));
          return;
        }
        html(response, 200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
          <form action="/" method="get"><button type="submit">Projects</button></form>`));
      } else {
        html(response, 404, page('Not found', '<h1>Page not found</h1>'));
      }
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent) {
        html(response, error.status ?? 500, page('Error', '<h1>Unable to complete request</h1>'));
      } else {
        response.end();
      }
    }
  });
  server.on('close', () => database.close());
  return server;
}
