import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const databasePath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const listProjects = database.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = database.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = database.prepare('INSERT INTO projects (name) VALUES (?)');

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendPage(response) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1c2634; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 56px auto; padding: 0 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; font-weight: 600; }
    input { box-sizing: border-box; width: min(440px, 60vw); padding: 10px 12px; border: 1px solid #aeb9c8; border-radius: 5px; font: inherit; }
    button { padding: 10px 14px; border: 0; border-radius: 5px; background: #2459a6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #194783; }
    #error { margin: 0 0 16px; color: #a32222; }
    [hidden] { display: none !important; }
    #projects { display: grid; gap: 10px; padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid #d6dde7; border-radius: 6px; background: white; }
    #detail { margin-bottom: 20px; }
    @media (max-width: 520px) { form { align-items: stretch; flex-direction: column; } input { width: 100%; } button { align-self: start; } }
  </style>
</head>
<body>
  <main>
    <section id="project-list">
      <h1>Workboard</h1>
      <form id="create-form">
        <label for="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </form>
      <p id="error" role="alert" hidden></p>
      <ul id="projects" aria-label="Projects"></ul>
    </section>
    <section id="detail" hidden>
      <button id="back" type="button">Projects</button>
      <h1 id="project-title"></h1>
    </section>
  </main>
  <script>
    const listView = document.querySelector('#project-list');
    const detailView = document.querySelector('#detail');
    const projectList = document.querySelector('#projects');
    const error = document.querySelector('#error');

    async function loadProjects() {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Unable to load projects');
      return response.json();
    }

    async function showList() {
      listView.hidden = false;
      detailView.hidden = true;
      projectList.replaceChildren();
      for (const project of await loadProjects()) {
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { window.location.href = '/projects/' + encodeURIComponent(project.id); });
        row.append(name, open);
        projectList.append(row);
      }
    }

    async function showProject(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { window.location.replace('/'); return; }
      const project = await response.json();
      listView.hidden = true;
      detailView.hidden = false;
      document.querySelector('#project-title').textContent = project.name;
    }

    document.querySelector('#create-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#project-name');
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'Project name is required';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to create project');
      input.value = '';
      await showList();
    });

    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    const match = window.location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) showProject(match[1]);
    else showList();
  </script>
</body>
</html>`);
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
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
      const body = await readRequestBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = createProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request body' });
    }
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    if (!project) sendJson(response, 404, { error: 'Project not found' });
    else sendJson(response, 200, project);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    sendPage(response);
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0');
