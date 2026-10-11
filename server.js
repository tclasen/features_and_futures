import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`);
const listProjects = db.prepare('SELECT id, name FROM projects ORDER BY id ASC');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; padding: 3rem 1.25rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #dce2ec; border-radius: 12px; box-shadow: 0 8px 24px #1720330b; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: .4rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: .65rem .75rem; border: 1px solid #9aa6b8; border-radius: 6px; font: inherit; }
    .field { flex: 1; }
    button { padding: .65rem 1rem; border: 0; border-radius: 6px; color: white; background: #2457c5; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1946a7; }
    button:focus-visible, input:focus-visible { outline: 3px solid #80aaff; outline-offset: 2px; }
    #error { color: #a11b1b; margin: 0 0 1rem; }
    #projects { list-style: none; margin: 0; padding: 0; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 0; border-top: 1px solid #e5e9f0; }
    .project-name { overflow-wrap: anywhere; }
    @media (max-width: 480px) { body { padding: 1rem .75rem; } main { padding: 1.25rem; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script type="module">
    const app = document.querySelector('#app');
    const escPath = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);

    async function request(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }

    function renderList(projects) {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      const form = document.createElement('form');
      form.noValidate = true;
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = 'project-name';
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.id = 'project-name';
      input.name = 'projectName';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = document.createElement('button');
      create.type = 'submit';
      create.textContent = 'Create project';
      form.append(field, create);
      const error = document.createElement('p');
      error.id = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const list = document.createElement('ul');
      list.id = 'projects';
      for (const project of projects) {
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.className = 'project-name';
        name.textContent = project.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
        row.append(name, open);
        list.append(row);
      }
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          error.textContent = 'Project name is required';
          error.hidden = false;
          input.focus();
          return;
        }
        error.hidden = true;
        try {
          const created = await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          projects.push(created);
          input.value = '';
          renderList(projects);
        } catch {
          error.textContent = 'Unable to create project';
          error.hidden = false;
        }
      });
      app.append(heading, form, error, list);
    }

    async function renderProject(id) {
      const project = await request('/api/projects/' + encodeURIComponent(id));
      app.replaceChildren();
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1');
      heading.textContent = project.name;
      app.append(back, heading);
    }

    if (escPath) {
      renderProject(escPath[1]).catch(() => { location.replace('/'); });
    } else {
      request('/api/projects').then(renderList).catch(() => {
        app.textContent = 'Unable to load projects';
      });
    }
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project || { error: 'Project not found' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error('Request too large');
      }
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = addProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});
