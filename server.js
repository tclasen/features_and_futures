import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const databasePath = resolve(process.env.DB_PATH || 'workboard.sqlite');
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
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17202a; background: #f5f7fa; }
    body { max-width: 760px; margin: 3rem auto; padding: 0 1.25rem; }
    h1 { margin-bottom: 1.5rem; }
    form { display: flex; gap: .65rem; margin-bottom: 1.5rem; }
    input, button { font: inherit; padding: .65rem .8rem; border: 1px solid #aab4c0; border-radius: .35rem; }
    input { flex: 1; min-width: 0; }
    button { background: #fff; cursor: pointer; }
    button:hover { background: #eaf0f7; }
    [role="alert"] { color: #a32222; margin: 0 0 1rem; }
    .project-list { display: grid; gap: .65rem; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 1rem; background: #fff; border: 1px solid #d5dce5; border-radius: .4rem; }
    .project-name { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script>
    const app = document.querySelector('#app');
    const projectMatch = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);

    function element(tag, text, attributes = {}) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      return node;
    }

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }

    async function showList() {
      app.replaceChildren();
      app.append(element('h1', 'Workboard'));
      const alert = element('p', '', { role: 'alert', hidden: '' });
      const form = element('form');
      const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', autocomplete: 'off' });
      const submit = element('button', 'Create project', { type: 'submit' });
      form.append(input, submit);
      const list = element('section', undefined, { class: 'project-list', 'aria-label': 'Projects' });
      app.append(alert, form, list);
      async function refresh() {
        list.replaceChildren();
        for (const project of await loadProjects()) {
          const row = element('div', undefined, { class: 'project-row', 'data-testid': 'project-row' });
          const name = element('span', project.name, { class: 'project-name' });
          const open = element('button', 'Open project', { type: 'button' });
          open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
          row.append(name, open);
          list.append(row);
        }
      }
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        alert.hidden = true;
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!response.ok) {
          alert.textContent = 'Could not create project';
          alert.hidden = false;
          return;
        }
        input.value = '';
        await refresh();
      });
      await refresh();
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      app.replaceChildren();
      const back = element('button', 'Projects', { type: 'button' });
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(back);
      if (!response.ok) {
        app.append(element('h1', 'Project not found'));
        return;
      }
      const project = await response.json();
      app.append(element('h1', project.name));
    }

    (projectMatch ? showProject(projectMatch[1]) : showList()).catch(() => {
      app.replaceChildren(element('p', 'Unable to load Workboard. Please refresh the page.', { role: 'alert' }));
    });
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
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
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendJson(response, 400, { error: 'Project name is required' });
      return;
    }
    const result = createProject.run(name);
    sendJson(response, 201, getProject.get(Number(result.lastInsertRowid)));
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
