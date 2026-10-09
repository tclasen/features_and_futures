import { createServer } from 'node:http';
import { parse } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || './workboard.db';

// Initialize SQLite database synchronously
const db = new DatabaseSync(DB_PATH);
// Ensure projects table exists
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

function escapeHtml(str) {
  return String(str).replace(/[&<>\"']/g, (s) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[s];
  });
}

function renderIndexPage(projects, alertMessage = '') {
  const rows = projects.map(p => `
    <li data-testid="project-row">${escapeHtml(p.name)} <a href="/projects/${p.id}"><button>Open project</button></a></li>`).join('');
  const alertDiv = alertMessage ? `<div role="alert" style="color:red;">${escapeHtml(alertMessage)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Workboard</title>
</head>
<body>
  <h1>Workboard</h1>
  ${alertDiv}
  <form method="POST" action="/projects">
    <label for="project-name">Project name</label>
    <input type="text" id="project-name" name="name" />
    <button type="submit">Create project</button>
  </form>
  <ul>
    ${rows}
  </ul>
</body>
</html>`;
}

function renderProjectPage(project) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(project.name)}</title>
</head>
<body>
  <h1>${escapeHtml(project.name)}</h1>
  <button onclick="location.href='/'">Projects</button>
</body>
</html>`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}

const server = createServer(async (req, res) => {
  const url = parse(req.url, true);
  try {
    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Home page
    if (req.method === 'GET' && url.pathname === '/') {
      const stmt = db.prepare('SELECT id, name FROM projects ORDER BY id');
      const projects = stmt.all();
      const html = renderIndexPage(projects);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Create project
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await parseBody(req);
      const params = new URLSearchParams(body);
      const name = params.get('name') ?? '';
      if (!name.trim()) {
        const stmt = db.prepare('SELECT id, name FROM projects ORDER BY id');
        const projects = stmt.all();
        const html = renderIndexPage(projects, 'Project name is required');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
      const insert = db.prepare('INSERT INTO projects (name) VALUES (?)');
      const info = insert.run(name.trim());
      // Redirect back to home
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }

    // Project detail page
    const projMatch = url.pathname.match(/^\/projects\/(\d+)$/);
    if (req.method === 'GET' && projMatch) {
      const id = Number(projMatch[1]);
      const stmt = db.prepare('SELECT id, name FROM projects WHERE id = ?');
      const project = stmt.get(id);
      if (!project) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Project not found');
        return;
      }
      const html = renderProjectPage(project);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
