import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || './data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
const projectQuery = `SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND completed = 1) AS completed
  FROM projects p`;
const listProjects = db.prepare(`${projectQuery} ORDER BY p.id`);
const getProject = db.prepare(`${projectQuery} WHERE p.id = ?`);
const listTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const getTask = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
const taskJSON = task => ({ ...task, completed: Boolean(task.completed) });
const page = readFileSync(new URL('./public/index.html', import.meta.url));
const script = readFileSync(new URL('./public/app.js', import.meta.url));
const style = readFileSync(new URL('./public/style.css', import.meta.url));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const taskMatch = path.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
    if (taskMatch) {
      const [, projectId, taskId] = taskMatch;
      const project = getProject.get(projectId);
      if (!project) return send(res, 404, { error: 'Project not found' });
      if (req.method === 'GET' && !taskId) return send(res, 200, listTasks.all(projectId).map(taskJSON));
      if ((req.method === 'POST' && !taskId) || (req.method === 'PATCH' && taskId)) {
        if (project.archived) return send(res, 409, { error: 'Archived project is read-only' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) return send(res, 413, { error: 'Request too large' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
        if (req.method === 'POST') {
          const title = typeof input?.title === 'string' ? input.title.trim() : '';
          if (!title) return send(res, 400, { error: 'Task title is required' });
          const result = insertTask.run(projectId, title);
          return send(res, 201, taskJSON(getTask.get(projectId, result.lastInsertRowid)));
        }
        if (!getTask.get(projectId, taskId)) return send(res, 404, { error: 'Task not found' });
        if (typeof input?.completed !== 'boolean') return send(res, 400, { error: 'Completion must be a boolean' });
        updateTask.run(Number(input.completed), projectId, taskId);
        return send(res, 200, taskJSON(getTask.get(projectId, taskId)));
      }
    }
    if (req.method === 'GET') {
      if (path === '/health') return send(res, 200, { status: 'ok' });
      if (path === '/api/projects') return send(res, 200, listProjects.all());
      const apiMatch = path.match(/^\/api\/projects\/(\d+)$/);
      if (apiMatch) {
        const project = getProject.get(apiMatch[1]);
        return project ? send(res, 200, project) : send(res, 404, { error: 'Project not found' });
      }
      if (path === '/' || /^\/projects\/\d+$/.test(path)) return send(res, 200, page, 'text/html; charset=utf-8');
      if (path === '/app.js') return send(res, 200, script, 'text/javascript; charset=utf-8');
      if (path === '/style.css') return send(res, 200, style, 'text/css; charset=utf-8');
    }
    const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === 'PATCH' && projectMatch) {
      const id = projectMatch[1];
      if (!getProject.get(id)) return send(res, 404, { error: 'Project not found' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return send(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
      if (typeof input?.archived !== 'boolean') return send(res, 400, { error: 'Archive state must be a boolean' });
      updateProject.run(Number(input.archived), id);
      return send(res, 200, getProject.get(id));
    }
    if (req.method === 'POST' && path === '/api/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return send(res, 413, { error: 'Request too large' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(res, 201, getProject.get(result.lastInsertRowid));
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Something went wrong' });
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
