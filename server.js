import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DB_PATH || './workboard.sqlite';
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
const addProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1e293b; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
    main { background: white; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 28px #1e293b0a; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; gap: 12px; margin-bottom: 24px; }
    label { display: block; margin-bottom: 7px; font-weight: 600; }
    .field { flex: 1; }
    input { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
    button { min-height: 42px; padding: 9px 16px; border: 0; border-radius: 6px; background: #2563eb; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .rows { display: grid; gap: 10px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .project-name { overflow-wrap: anywhere; }
    .error { color: #b91c1c; margin: -12px 0 18px; }
    [hidden] { display: none !important; }
    @media (max-width: 520px) { body { padding: 20px 12px; } main { padding: 22px 16px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script>
    const app = document.querySelector('#app');
    const escapePath = (id) => '/projects/' + encodeURIComponent(id);

    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    async function projectsPage() {
      app.replaceChildren();
      app.append(element('h1', 'Workboard'));
      const form = document.createElement('form');
      const field = element('div', undefined, 'field');
      const label = element('label', 'Project name');
      label.htmlFor = 'project-name';
      const input = document.createElement('input');
      input.id = 'project-name';
      input.name = 'projectName';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = element('button', 'Create project');
      create.type = 'submit';
      form.append(field, create);
      const error = element('p', 'Project name is required', 'error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      app.append(form, error);
      const rows = element('div', undefined, 'rows');
      rows.setAttribute('aria-label', 'Projects');
      app.append(rows);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) { error.hidden = false; input.focus(); return; }
        error.hidden = true;
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (response.ok) { input.value = ''; await loadRows(rows); }
      });
      await loadRows(rows);
    }

    async function loadRows(rows) {
      const response = await fetch('/api/projects');
      const projects = await response.json();
      rows.replaceChildren();
      for (const project of projects) {
        const row = element('div', undefined, 'project-row');
        row.dataset.testid = 'project-row';
        row.append(element('span', project.name, 'project-name'));
        const open = element('button', 'Open project');
        open.type = 'button';
        open.addEventListener('click', () => { location.href = escapePath(project.id); });
        row.append(open);
        rows.append(row);
      }
    }

    async function projectPage(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { history.replaceState(null, '', '/'); await render(); return; }
      const project = await response.json();
      app.replaceChildren();
      const back = element('button', 'Projects');
      back.type = 'button';
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(back, element('h1', project.name));
    }

    async function render() {
      const match = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);
      if (match) await projectPage(decodeURIComponent(match[1]));
      else await projectsPage();
    }
    render();
  </script>
</body>
</html>`;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok' }));
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return send(response, 200, JSON.stringify(listProjects.all()));
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return send(response, 400, JSON.stringify({ error: 'Project name is required' }));
    const result = addProject.run(name);
    return send(response, 201, JSON.stringify({ id: Number(result.lastInsertRowid), name }));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(projectMatch[1]);
    return project
      ? send(response, 200, JSON.stringify(project))
      : send(response, 404, JSON.stringify({ error: 'Project not found' }));
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/[^/]+\/?$/.test(url.pathname))) {
    return send(response, 200, page(), 'text/html; charset=utf-8');
  }
  send(response, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0');
