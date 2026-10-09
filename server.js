import http from 'node:http';
import { URL } from 'node:url';
import sqlite from 'node:sqlite';
import sqlite3 from 'node:sqlite3';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || 'workboard.db';

async function initDb() {
  const db = await sqlite.open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  return db;
}

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', err => reject(err));
  });
}

(async () => {
  const db = await initDb();

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Health endpoint
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    // Serve index page
    if (req.method === 'GET' && pathname === '/') {
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Workboard</title>
</head>
<body>
<h1>Workboard</h1>
<input id="project-name" placeholder="Project name" aria-label="Project name" />
<button id="create-project">Create project</button>
<div id="alert" style="color:red;display:none;"></div>
<div id="project-list"></div>
<script>
async function loadProjects() {
  const res = await fetch('/projects');
  const projects = await res.json();
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  for (const p of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.textContent = p.name + ' ';
    const btn = document.createElement('button');
    btn.textContent = 'Open project';
    btn.onclick = () => { location.href = `/projects/${p.id}`; };
    row.appendChild(btn);
    list.appendChild(row);
  }
}

document.getElementById('create-project').onclick = async () => {
  const nameInput = document.getElementById('project-name');
  const name = nameInput.value.trim();
  const alertDiv = document.getElementById('alert');
  if (!name) {
    alertDiv.textContent = 'Project name is required';
    alertDiv.style.display = 'block';
    return;
  }
  alertDiv.style.display = 'none';
  const res = await fetch('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    await loadProjects();
    nameInput.value = '';
  } else {
    const err = await res.text();
    alertDiv.textContent = err;
    alertDiv.style.display = 'block';
  }
};

window.onload = loadProjects;
</script>
</body>
</html>`;
      return sendHtml(res, indexHtml);
    }

    // API: list projects
    if (req.method === 'GET' && pathname === '/projects') {
      const rows = await db.all('SELECT id, name FROM projects ORDER BY id ASC');
      return sendJson(res, 200, rows);
    }

    // API: create project
    if (req.method === 'POST' && pathname === '/projects') {
      try {
        const body = await parseBody(req);
        const data = JSON.parse(body);
        const name = (data.name || '').trim();
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          return res.end('Project name is required');
        }
        const result = await db.run('INSERT INTO projects (name) VALUES (?)', name);
        const project = { id: result.lastID, name };
        return sendJson(res, 201, project);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Server Error');
      }
    }

    // Project page
    const projectPageMatch = pathname.match(/^\/projects\/(\d+)$/);
    if (req.method === 'GET' && projectPageMatch) {
      const id = Number(projectPageMatch[1]);
      const row = await db.get('SELECT id, name FROM projects WHERE id = ?', id);
      if (!row) return notFound(res);
      const projectHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${row.name}</title></head>
<body>
<h1>${row.name}</h1>
<button onclick="location.href='/'">Projects</button>
</body>
</html>`;
      return sendHtml(res, projectHtml);
    }

    // Fallback
    notFound(res);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
})();
