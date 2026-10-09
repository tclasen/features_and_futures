import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const database = new DatabaseSync(process.env.DB_PATH || 'workboard.sqlite');
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; }
    main { max-width: 760px; margin: 48px auto; padding: 0 24px; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form { display: flex; align-items: end; gap: 12px; padding: 20px; background: white; border: 1px solid #dce2ec; border-radius: 10px; }
    label { display: grid; gap: 6px; flex: 1; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #aeb8c8; border-radius: 6px; font: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 6px; background: #2457c5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1946a8; }
    #alert { min-height: 1.5em; margin: 10px 0; color: #a32121; }
    #projects { display: grid; gap: 10px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: white; border: 1px solid #dce2ec; border-radius: 8px; }
    .project-name { overflow-wrap: anywhere; }
    a { color: inherit; text-decoration: none; }
    @media (max-width: 520px) { main { margin-top: 28px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const path = window.location.pathname;
    const projectMatch = path.match(/^\\/projects\\/(\\d+)\\/?$/);

    async function loadProjects() {
      const response = await fetch('/api/projects');
      return response.json();
    }

    function element(tag, attributes = {}, content = '') {
      const item = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
      item.textContent = content;
      return item;
    }

    async function showProjects() {
      document.title = 'Workboard';
      app.replaceChildren(element('h1', {}, 'Workboard'));
      const form = element('form');
      const label = element('label', { for: 'project-name' }, 'Project name');
      const input = element('input', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
      label.append(input);
      const submit = element('button', { type: 'submit' }, 'Create project');
      form.append(label, submit);
      const alert = element('p', { id: 'alert', role: 'alert', 'aria-live': 'polite' });
      const list = element('section', { id: 'projects', 'aria-label': 'Projects' });
      app.append(form, alert, list);

      async function refresh() {
        const projects = await loadProjects();
        list.replaceChildren(...projects.map(project => {
          const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
          row.append(element('span', { class: 'project-name' }, project.name));
          const open = element('button', { type: 'button' }, 'Open project');
          open.addEventListener('click', () => { window.location.href = '/projects/' + project.id; });
          row.append(open);
          return row;
        }));
      }

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (response.ok) {
          input.value = '';
          alert.textContent = '';
          await refresh();
        }
      });
      await refresh();
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + id);
      if (!response.ok) { window.location.replace('/'); return; }
      const project = await response.json();
      document.title = project.name + ' | Workboard';
      const back = element('button', { type: 'button' }, 'Projects');
      back.addEventListener('click', () => { window.location.href = '/'; });
      app.replaceChildren(element('h1', {}, project.name), back);
    }

    if (projectMatch) showProject(projectMatch[1]);
    else showProjects();
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const projects = database.prepare('SELECT id, name FROM projects ORDER BY id').all();
    return sendJson(response, 200, projects);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = database.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    return sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = database.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
