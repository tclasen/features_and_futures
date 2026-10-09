import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || './data/workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17212b; background: #f5f7fa; }
    body { margin: 0; }
    main { width: min(680px, calc(100% - 40px)); margin: 56px auto; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 10px; margin-bottom: 24px; }
    label { display: block; margin-bottom: 7px; font-weight: 600; }
    .field { flex: 1; }
    input { box-sizing: border-box; width: 100%; padding: 11px 12px; border: 1px solid #aab5c1; border-radius: 6px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 10px 15px; background: #145ec8; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #0d4da8; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px; margin: 10px 0; background: white; border: 1px solid #d9e0e7; border-radius: 8px; }
    .alert { color: #a32323; margin: 0 0 16px; }
    .back { margin-bottom: 24px; background: #455568; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const projectPath = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }

    async function showList() {
      app.innerHTML = '<h1>Workboard</h1><form id="create-form"><div class="field"><label for="project-name">Project name</label><input id="project-name" name="name" type="text" autocomplete="off"></div><button type="submit">Create project</button></form><p id="alert" class="alert" role="alert" hidden></p><section id="projects" aria-label="Projects"></section>';
      const form = document.querySelector('#create-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = new FormData(form).get('name').trim();
        const alert = document.querySelector('#alert');
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          return;
        }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (response.ok) await renderProjects();
      });
      await renderProjects();
    }

    async function renderProjects() {
      const projects = await loadProjects();
      const list = document.querySelector('#projects');
      list.replaceChildren(...projects.map((project) => {
        const row = document.createElement('div');
        row.className = 'project-row';
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
        row.append(name, open);
        return row;
      }));
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) {
        app.innerHTML = '<h1>Project not found</h1><button class="back" type="button">Projects</button>';
      } else {
        const project = await response.json();
        app.innerHTML = '<button class="back" type="button">Projects</button><h1></h1>';
        app.querySelector('h1').textContent = project.name;
      }
      app.querySelector('.back').addEventListener('click', () => { location.href = '/'; });
    }

    if (projectPath) showProject(decodeURIComponent(projectPath[1]));
    else showList();
  </script>
</body>
</html>`;

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    send(response, 200, page, 'text/html; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && /^\/projects\/[^/]+\/?$/.test(url.pathname)) {
    send(response, 200, page, 'text/html; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY created_at, rowid').all();
    send(response, 200, JSON.stringify(projects));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const { name } = await readJson(request);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        send(response, 400, JSON.stringify({ error: 'Project name is required' }));
        return;
      }
      const project = { id: randomUUID(), name: trimmedName };
      database.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, Date.now());
      send(response, 201, JSON.stringify(project));
    } catch {
      send(response, 400, JSON.stringify({ error: 'Invalid request' }));
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(decodeURIComponent(projectMatch[1]));
    send(response, project ? 200 : 404, JSON.stringify(project || { error: 'Project not found' }));
    return;
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
