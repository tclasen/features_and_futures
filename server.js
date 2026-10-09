import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const dbPath = process.env.DB_PATH ?? './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(720px, calc(100% - 32px)); margin: 56px auto; }
    h1 { margin: 0 0 24px; font-size: 2rem; }
    form, .project-row { display: flex; align-items: center; gap: 12px; }
    form { margin-bottom: 24px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    .field { flex: 1; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #aab3c2; border-radius: 6px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #2457c5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1745a8; }
    .project-row { justify-content: space-between; padding: 14px 16px; margin: 10px 0; background: white; border: 1px solid #d9deea; border-radius: 8px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; }
    [role="alert"] { color: #a21d2d; margin: 0 0 16px; }
    .back { margin-bottom: 20px; background: #46536b; }
    @media (max-width: 520px) { form { align-items: stretch; flex-direction: column; } form button { width: 100%; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const app = document.querySelector('#app');
    const element = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    };

    async function showProjects() {
      const projects = await fetch('/api/projects').then((response) => response.json());
      app.replaceChildren();
      app.append(element('h1', 'Workboard'));
      const form = element('form');
      form.noValidate = true;
      const field = element('div', undefined, 'field');
      const label = element('label', 'Project name');
      label.htmlFor = 'project-name';
      const input = element('input');
      input.id = 'project-name';
      input.name = 'name';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = element('button', 'Create project');
      create.type = 'submit';
      form.append(field, create);
      const alert = element('p');
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
        });
        if (response.ok) await showProjects();
      });
      app.append(form, alert);
      for (const project of projects) {
        const row = element('div', undefined, 'project-row');
        row.dataset.testid = 'project-row';
        const name = element('span', project.name, 'project-name');
        const open = element('button', 'Open project');
        open.type = 'button';
        open.addEventListener('click', () => navigate('/projects/' + encodeURIComponent(project.id)));
        row.append(name, open);
        app.append(row);
      }
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { navigate('/'); return; }
      const project = await response.json();
      app.replaceChildren();
      const back = element('button', 'Projects', 'back');
      back.type = 'button';
      back.addEventListener('click', () => navigate('/'));
      app.append(back, element('h1', project.name));
    }

    function navigate(path) {
      history.pushState({}, '', path);
      render();
    }
    function render() {
      const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
      if (match) showProject(match[1]);
      else showProjects();
    }
    addEventListener('popstate', render);
    render();
  </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, db.prepare('SELECT id, name FROM projects ORDER BY id').all());
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    if (typeof name !== 'string' || !name.trim()) return sendJson(res, 400, { error: 'Project name is required' });
    const cleanName = name.trim();
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(cleanName);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid), name: cleanName });
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(Number(projectMatch[1]));
    return project ? sendJson(res, 200, project) : sendJson(res, 404, { error: 'Project not found' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
