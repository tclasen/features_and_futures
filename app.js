import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const stylesheet = readFileSync(new URL('./public/styles.css', import.meta.url));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Workboard</title><link rel="stylesheet" href="/styles.css"></head>
<body><main>${content}</main></body></html>`;
}

function projectList(projects, error = '') {
  return page('Projects', `<h1>Workboard</h1>
    <form method="post" action="/projects" class="create-form">
      <label for="project-name">Project name</label>
      <div class="input-group"><input id="project-name" name="name" type="text">
      <button type="submit">Create project</button></div>
    </form>
    ${error ? `<p role="alert" class="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-label="Projects" class="project-list">
      ${projects.map((project) => `<div data-testid="project-row" class="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </section>`);
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createWorkboardServer(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const findProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insertProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

  const server = createServer(async (request, response) => {
    function send(status, body, type = 'text/html; charset=utf-8') {
      response.writeHead(status, { 'Content-Type': type });
      response.end(body);
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        return send(200, JSON.stringify({ status: 'ok' }), 'application/json');
      }
      if (request.method === 'GET' && url.pathname === '/styles.css') {
        return send(200, stylesheet, 'text/css; charset=utf-8');
      }
      if (request.method === 'GET' && url.pathname === '/') {
        return send(200, projectList(listProjects.all()));
      }
      if (request.method === 'POST' && url.pathname === '/projects') {
        const form = await readForm(request);
        const name = (form.get('name') ?? '').trim();
        if (!name) return send(400, projectList(listProjects.all(), 'Project name is required'));
        insertProject.run(name);
        response.writeHead(303, { Location: '/' });
        return response.end();
      }
      const match = /^\/projects\/([1-9]\d*)$/.exec(url.pathname);
      if (request.method === 'GET' && match) {
        const id = Number(match[1]);
        const project = Number.isSafeInteger(id) ? findProject.get(id) : undefined;
        if (project) {
          return send(200, page(project.name, `<h1>${escapeHtml(project.name)}</h1>
            <form method="get" action="/"><button type="submit">Projects</button></form>`));
        }
      }
      send(404, page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>'));
    } catch (error) {
      if (!error.status) console.error(error);
      send(error.status ?? 500, page('Error', '<h1>Unable to complete request</h1><a href="/">Projects</a>'));
    }
  });
  server.on('close', () => database.close());
  return server;
}
