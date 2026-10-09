// server.js
import http from 'node:http';
import { URL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.resolve('data.db');

const db = new DatabaseSync(DB_PATH);
// Initialize table if not exists
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);`);

function jsonResponse(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

async function serveStatic(res, filePath, contentType) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (e) {
    notFound(res);
  }
}

// Simple router
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // health endpoint
  if (req.method === 'GET' && pathname === '/health') {
    jsonResponse(res, 200, { status: 'ok' });
    return;
  }

  // API routes
  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT id, name FROM projects ORDER BY id ASC').all();
      jsonResponse(res, 200, rows);
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const { name } = JSON.parse(body);
          const trimmed = typeof name === 'string' ? name.trim() : '';
          if (!trimmed) {
            jsonResponse(res, 400, { error: 'Project name is required' });
            return;
          }
          const stmt = db.prepare('INSERT INTO projects (name) VALUES (?)');
          const info = stmt.run(trimmed);
          jsonResponse(res, 201, { id: info.lastInsertRowid, name: trimmed });
        } catch (e) {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }
    notFound(res);
    return;
  }

  // Serve project page
  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch && req.method === 'GET') {
    const id = Number(projectMatch[1]);
    const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
    if (!row) {
      notFound(res);
      return;
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Project ${row.id}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 2rem; }
  button { margin-top: 1rem; }
</style>
</head>
<body>
<h1>${row.name}</h1>
<button id="backBtn">Projects</button>
<script>
  document.getElementById('backBtn').addEventListener('click', () => {
    location.href = '/';
  });
</script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Root page - list and create projects
  if (pathname === '/' && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Workboard</title>
<style>
  body { font-family: Arial, sans-serif; margin: 2rem; }
  .project-row { margin: 0.5rem 0; }
  button { margin-left: 0.5rem; }
</style>
</head>
<body>
<h1>Workboard</h1>
<div>
  <label for="projectNameInput">Project name</label>
  <input type="text" id="projectNameInput" />
  <button id="createBtn">Create project</button>
</div>
<div id="projectsList"></div>
<div id="alertContainer" role="alert" style="color: red; display: none; margin-top: 0.5rem;"></div>
<script>
function showAlert(message) {
  const el = document.getElementById('alertContainer');
  el.textContent = message;
  el.style.display = 'block';
}
function hideAlert() {
  const el = document.getElementById('alertContainer');
  el.style.display = 'none';
}
  async function loadProjects() {
    hideAlert();
    const resp = await fetch('/api/projects');
    const projects = await resp.json();
    const listDiv = document.getElementById('projectsList');
    listDiv.innerHTML = '';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      row.textContent = p.name;
      const btn = document.createElement('button');
      btn.textContent = 'Open project';
      btn.addEventListener('click', () => {
        location.href = \`/projects/\${p.id}\`;
      });
      row.appendChild(btn);
      listDiv.appendChild(row);
    });
  }

  document.getElementById('createBtn').addEventListener('click', async () => {
    const input = document.getElementById('projectNameInput');
    const name = input.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (resp.ok) {
      input.value = '';
      loadProjects();
    } else {
      const err = await resp.json();
      showAlert(err.error || 'Error creating project');
    }
  });

  loadProjects();
</script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Fallback
  notFound(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
