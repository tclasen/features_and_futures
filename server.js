import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { URL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'workboard.db');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

// Simple JSON storage for projects
async function loadData() {
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { projects: [] };
  }
}
async function saveData(data) {
  await writeFile(DB_PATH, JSON.stringify(data), 'utf8');
}
function nextId(projects) {
  return projects.length ? Math.max(...projects.map(p => p.id)) + 1 : 1;
}

async function serveFile(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pathname.startsWith('/api/')) {
    // Load current data
    const data = await loadData();
    const projects = data.projects;

    // List projects
    if (pathname === '/api/projects' && req.method === 'GET') {
      const rows = projects.map(p => ({ id: p.id, name: p.name }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
      return;
    }
    // Create project
    if (pathname === '/api/projects' && req.method === 'POST') {
      try {
        const body = await parseJson(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project name is required' }));
          return;
        }
        const id = nextId(projects);
        const newProj = { id, name };
        projects.push(newProj);
        await saveData({ projects });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newProj));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      return;
    }
    // Get single project
    if (/^\/api\/projects\/\d+$/.test(pathname) && req.method === 'GET') {
      const id = Number(pathname.split('/').pop());
      const proj = projects.find(p => p.id === id);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proj));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // UI routes
  if (pathname === '/' && req.method === 'GET') {
    await serveFile(path.join(PUBLIC_DIR, 'index.html'), res);
    return;
  }
  if (pathname.startsWith('/projects/') && req.method === 'GET') {
    await serveFile(path.join(PUBLIC_DIR, 'project.html'), res);
    return;
  }
  if (pathname.startsWith('/static/') && req.method === 'GET') {
    const filePath = path.join(PUBLIC_DIR, pathname);
    await serveFile(filePath, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
