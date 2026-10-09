import http from 'node:http'; // Updated for Task 002 compliance
import { URL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import sqlite from 'node:sqlite';

const require = createRequire(import.meta.url);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'workboard.db');

// Initialize SQLite database using the experimental synchronous API.
const { DatabaseSync } = sqlite;
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Helper to serve static files
async function serveStatic(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

// Simple JSON body parser
async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Health endpoint
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // API routes under /api/
  if (pathname.startsWith('/api/')) {
    // Enable CORS for local testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // /api/projects
    if (pathname === '/api/projects') {
        if (req.method === 'GET') {
        const rows = db.prepare('SELECT id, name FROM projects ORDER BY id').all();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
      }
      if (req.method === 'POST') {
        const { name } = await parseJson(req);
        const trimmed = (name || '').trim();
        if (!trimmed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project name is required' }));
          return;
        }
        const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmed);
        const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(result.lastInsertRowid);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(project));
        return;
      }
    }

    // /api/projects/:id/tasks and /api/projects/:id
    const projectIdMatch = pathname.match(/^\/api\/projects\/(\d+)(?:\/tasks)?$/);
    if (projectIdMatch) {
      const projectId = Number(projectIdMatch[1]);
      if (pathname.endsWith('/tasks')) {
        if (req.method === 'GET') {
          const stmt = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
          const tasks = stmt.all(projectId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tasks));
          return;
        }
        if (req.method === 'POST') {
          const { title } = await parseJson(req);
          const trimmed = (title || '').trim();
          if (!trimmed) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task title is required' }));
            return;
          }
          db.prepare('INSERT INTO tasks (project_id, title, completed) VALUES (?,?,0)')
            .run(projectId, trimmed);
          const tasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id')
            .all(projectId);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tasks));
          return;
        }
      } else {
        // GET single project (used for heading)
        if (req.method === 'GET') {
          const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId);
          if (!project) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Project not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(project));
          return;
        }
      }
    }

    // PATCH task completion
    const taskPatchMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (taskPatchMatch && req.method === 'PATCH') {
      const taskId = Number(taskPatchMatch[1]);
      const { completed } = await parseJson(req);
      const completedInt = completed ? 1 : 0;
      db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completedInt, taskId);
      res.writeHead(200);
      res.end();
      return;
    }

    // Unknown API route
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Serve static files. For any non-API path, fallback to index.html (client‑side routing)
  if (pathname === '/' || pathname.startsWith('/projects')) {
    await serveStatic(path.join(PUBLIC_DIR, 'index.html'), res);
    return;
  }

  // Attempt to serve the exact file from public
  const filePath = path.join(PUBLIC_DIR, pathname);
  await serveStatic(filePath, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

