import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}

const escape = (value) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Workboard</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font: 16px system-ui, sans-serif; color: #192b40; background: #f3f6fa; }
main { max-width: 760px; margin: 60px auto; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 4px 24px #192b4010; }
h1 { margin-top: 0; overflow-wrap: anywhere; }
label { display: block; font-weight: 600; margin-bottom: 8px; }
input { padding: 10px; border: 1px solid #8b98a7; border-radius: 5px; font: inherit; width: min(100%, 400px); }
button { padding: 10px 16px; border: 0; border-radius: 5px; background: #235baf; color: white; font: inherit; cursor: pointer; }
select { padding: 10px; font: inherit; }
input[type=checkbox] { width: auto; }
.task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
.task { padding: 16px 0; border-top: 1px solid #dfe5ed; }
.task-create { margin-top: 28px; margin-bottom: 24px; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #ebad32; outline-offset: 3px; }
.create { display: flex; gap: 12px; flex-wrap: wrap; }
.projects { margin-top: 28px; }
.project { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dfe5ed; }
.project span { overflow-wrap: anywhere; min-width: 0; }
.project form { flex-shrink: 0; }
[role=alert] { color: #a21c25; background: #fff0f1; padding: 12px; border-radius: 5px; }
@media (max-width: 600px) { main { margin: 16px; padding: 24px; } }
</style></head><body><main>${content}</main></body></html>`;
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function projectList(res, error = '', filter = 'Active') {
  const projects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ?
    GROUP BY p.id ORDER BY p.id`).all(filter === 'Archived' ? 1 : 0);
  sendHtml(res, 200, page('Projects', `<h1>Workboard</h1>
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form method="post" action="/projects">
<label for="project-name">Project name</label>
<div class="create"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
</form>
<form method="get" action="/">
<label for="project-filter">Project filter</label>
<select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<section class="projects" aria-label="Projects">${projects.map(project => `
<div class="project" data-testid="project-row"><span>${escape(project.name)}</span>
<span data-testid="project-summary">${project.completed}/${project.total} completed</span>
<form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
<form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form></div>`).join('')}
${projects.length ? '' : '<p>No projects yet.</p>'}</section>`));
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed'].includes(value) ? value : 'All';
}

function projectPage(res, project, filter = 'All', error = '') {
  const tasks = db.prepare(`SELECT id, title, completed FROM tasks WHERE project_id = ?
    ${filter === 'All' ? '' : 'AND completed = ?'} ORDER BY id`)
    .all(...(filter === 'All' ? [project.id] : [project.id, filter === 'Completed' ? 1 : 0]));
  sendHtml(res, 200, page(project.name, `<h1>${escape(project.name)}</h1>
<form method="get" action="/"><button type="submit">Projects</button></form>
${project.archived ? '<p>Archived project</p>' : ''}
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form class="task-create" method="post" action="/projects/${project.id}/rename">
<input type="hidden" name="filter" value="${filter}">
<label for="new-project-name">New project name</label>
<div class="create"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
</form>
<form class="task-create" method="post" action="/projects/${project.id}/tasks">
<input type="hidden" name="filter" value="${filter}">
<label for="task-title">Task title</label>
<div class="create"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
</form>
<form method="get" action="/projects/${project.id}">
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
${['All', 'Open', 'Completed'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<section class="projects" aria-label="Tasks">${tasks.map(task => `
<div class="task" data-testid="task-row">
<form method="post" action="/projects/${project.id}/tasks/${task.id}">
<input type="hidden" name="filter" value="${filter}">
<label><input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escape(task.title)}</span></label>
</form></div>`).join('')}
${tasks.length ? '' : '<p>No tasks to show.</p>'}</section>`));
}

async function formBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      projectList(res, '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(req);
      const name = (body.get('name') || '').trim();
      if (!name) {
        projectList(res, 'Project name is required');
        return;
      }
      db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(url.pathname);
    if (req.method === 'POST' && renameMatch) {
      const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(res, 403, page('Archived project', '<h1>Archived project</h1><p>Archived projects cannot be changed.</p>'));
          return;
        }
        const body = await formBody(req);
        const filter = taskFilter(body.get('filter'));
        const name = (body.get('name') || '').trim();
        if (!name) {
          projectPage(res, project, filter, 'Project name is required');
          return;
        }
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, project.id);
        res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
        res.end();
        return;
      }
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(url.pathname);
    if (req.method === 'POST' && archiveMatch) {
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?')
        .run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        res.writeHead(303, { Location: archiveMatch[2] === 'archive' ? '/' : '/?filter=Archived' });
        res.end();
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+))?$/.exec(url.pathname);
    if (req.method === 'POST' && taskMatch) {
      const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(res, 403, page('Archived project', '<h1>Archived project</h1><p>Archived projects cannot be changed.</p>'));
          return;
        }
        const body = await formBody(req);
        const filter = taskFilter(body.get('filter'));
        if (taskMatch[2]) {
          const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
            .run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (body.get('title') || '').trim();
          if (!title) {
            projectPage(res, project, filter, 'Task title is required');
            return;
          }
          db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)').run(project.id, title);
        }
        res.writeHead(303, { Location: `/projects/${project.id}?filter=${filter}` });
        res.end();
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const project = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(match[1]);
      if (project) {
        projectPage(res, project, taskFilter(url.searchParams.get('filter')));
        return;
      }
    }
    sendHtml(res, 404, page('Not found', '<h1>Not found</h1><form action="/" method="get"><button>Projects</button></form>'));
  } catch (error) {
    if (error.status === 413) {
      res.writeHead(413);
      res.end('Request too large');
      return;
    }
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
