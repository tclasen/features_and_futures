import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const databasePath = resolve(process.env.DB_PATH ?? 'workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; }
    main { width: min(44rem, calc(100% - 2rem)); margin: 3rem auto; }
    h1 { margin-bottom: 1.5rem; }
    form, [data-testid="project-row"] { display: flex; align-items: center; gap: .75rem; }
    form { flex-wrap: wrap; margin-bottom: 1rem; }
    label { width: 100%; font-weight: 600; }
    input { flex: 1; min-width: 12rem; padding: .65rem; border: 1px solid #9aa5b8; border-radius: .35rem; font: inherit; }
    button { padding: .65rem 1rem; border: 0; border-radius: .35rem; background: #2457c5; color: white; font: inherit; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #8ab4ff; outline-offset: 2px; }
    [data-testid="project-row"] { justify-content: space-between; padding: 1rem; margin: .5rem 0; background: white; border: 1px solid #dce2ec; border-radius: .4rem; }
    [role="alert"] { color: #a22020; min-height: 1.5em; }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const app = document.querySelector('#app');

    function element(tag, text, attributes = {}) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      return node;
    }

    async function request(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }

    async function showProjects() {
      app.replaceChildren(element('h1', 'Workboard'));
      const form = element('form');
      const label = element('label', 'Project name', { for: 'project-name' });
      const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
      const submit = element('button', 'Create project', { type: 'submit' });
      const alert = element('p', undefined, { role: 'alert', 'aria-live': 'polite' });
      form.append(label, input, submit);
      app.append(form, alert);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          return;
        }
        alert.textContent = '';
        try {
          await request('/api/projects', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name })
          });
          await showProjects();
        } catch {
          alert.textContent = 'Unable to create project';
        }
      });

      try {
        const projects = await request('/api/projects');
        for (const project of projects) {
          const row = element('section', undefined, { 'data-testid': 'project-row' });
          row.append(element('span', project.name));
          const open = element('button', 'Open project', { type: 'button' });
          open.addEventListener('click', () => { window.location.href = '/projects/' + encodeURIComponent(project.id); });
          row.append(open);
          app.append(row);
        }
      } catch {
        alert.textContent = 'Unable to load projects';
      }
    }

    async function showProject(id) {
      try {
        const project = await request('/api/projects/' + encodeURIComponent(id));
        app.replaceChildren(element('h1', project.name));
        const back = element('button', 'Projects', { type: 'button' });
        back.addEventListener('click', () => { window.location.href = '/'; });
        app.append(back);
      } catch {
        app.replaceChildren(element('h1', 'Project not found'));
        const back = element('button', 'Projects', { type: 'button' });
        back.addEventListener('click', () => { window.location.href = '/'; });
        app.append(back);
      }
    }

    const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
    if (match) await showProject(match[1]);
    else await showProjects();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    sendJson(response, 200, listProjects.all());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const input = await readJson(request);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    sendJson(response, 200, project);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');

function close() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
