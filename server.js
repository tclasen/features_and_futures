import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/workboard.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
const allProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const findProject = db.prepare('SELECT id, name FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);`);
const projectTasks = db.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const createTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const taskFilter = value => ['Open', 'Completed'].includes(value) ? value : 'All';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const page = (title, content) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#192334;font:16px system-ui,sans-serif}main{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:36px;margin:0 0 30px}h2{font-size:20px;margin-top:36px}.panel,.project-row{background:white;border:1px solid #dce2ec;border-radius:10px;padding:20px}.panel label{display:block;font-weight:600;margin-bottom:8px}.input-line{display:flex;gap:12px;flex-wrap:wrap}input{font:inherit;border:1px solid #8996aa;border-radius:6px;padding:10px;flex:1;min-width:180px}button{font:inherit;cursor:pointer;border:0;border-radius:6px;background:#245ac5;color:white;padding:11px 16px}button:hover{background:#19469e}button:focus-visible,input:focus-visible{outline:3px solid #e69b22;outline-offset:3px}.project-row{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:12px 0}.project-name{overflow-wrap:anywhere;min-width:0}.project-row form{flex-shrink:0}[role=alert]{color:#a51926;margin-bottom:16px}.empty{color:#5b6779}
.task-row{display:flex;align-items:center;gap:12px;background:white;border:1px solid #dce2ec;border-radius:10px;padding:16px;margin:12px 0}.task-row label{overflow-wrap:anywhere}.task-row input{min-width:0;flex:none;width:20px;height:20px}.filter{margin:24px 0}select{font:inherit;padding:8px;border-radius:6px}select:focus-visible{outline:3px solid #e69b22;outline-offset:3px}
</style><script src="/tasks.js" defer></script></head><body><main>${content}</main></body></html>`;

function sendHtml(res, status, title, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page(title, content));
}
function projectList(res, error = '', value = '') {
  const projects = allProjects.all();
  sendHtml(res, error ? 400 : 200, 'Projects', `<h1>Workboard</h1>
<form class="panel" method="post" action="/projects">
${error ? `<div role="alert">${escape(error)}</div>` : ''}
<label for="project-name">Project name</label><div class="input-line"><input id="project-name" name="name" value="${escape(value)}"><button type="submit">Create project</button></div></form>
<h2>Projects</h2>${projects.length ? projects.map(p => `<div class="project-row" data-testid="project-row"><span class="project-name">${escape(p.name)}</span><form method="get" action="/projects/${p.id}"><button type="submit">Open project</button></form></div>`).join('') : '<p class="empty">No projects yet.</p>'}`);
}

function projectPage(res, project, filter = 'All', error = '') {
  const tasks = projectTasks.all(project.id).filter(task => filter === 'All' || Boolean(task.completed) === (filter === 'Completed'));
  sendHtml(res, error ? 400 : 200, project.name, `<h1>${escape(project.name)}</h1>
<form method="get" action="/"><button type="submit">Projects</button></form>
<h2>Tasks</h2><form class="panel" method="post" action="/projects/${project.id}/tasks">
${error ? `<div role="alert">${escape(error)}</div>` : ''}
<input type="hidden" name="filter" value="${filter}">
<label for="task-title">Task title</label><div class="input-line"><input id="task-title" name="title"><button type="submit">Create task</button></div></form>
<form class="filter" method="get" action="/projects/${project.id}"><label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${['All', 'Open', 'Completed'].map(option => `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}</select></form>
${tasks.length ? tasks.map(task => `<form class="task-row" data-testid="task-row" method="post" action="/projects/${project.id}/tasks/${task.id}">
<input type="hidden" name="filter" value="${filter}"><input type="checkbox" id="task-${task.id}" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}><label for="task-${task.id}">${escape(task.title)}</label></form>`).join('') : '<p class="empty">No matching tasks.</p>'}`);
}
async function readForm(req) {
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
function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const taskScript = `
const pendingSaves = new Set();
document.addEventListener('change', event => {
  const checkbox = event.target;
  if (!checkbox.matches('.task-row input[type="checkbox"]')) return;
  const form = checkbox.form;
  const completed = checkbox.checked;
  const body = new URLSearchParams(new FormData(form));
  checkbox.disabled = true;
  const save = (async () => {
    try {
      const response = await fetch(form.action, { method: 'POST', body });
      if (!response.ok) throw new Error('Unable to save task');
      const filter = body.get('filter');
      if (filter !== 'All' && completed !== (filter === 'Completed')) form.remove();
    } catch (error) {
      checkbox.checked = !completed;
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Unable to save task. Please try again.';
      form.after(alert);
    } finally {
      checkbox.disabled = false;
    }
  })();
  pendingSaves.add(save);
  save.finally(() => pendingSaves.delete(save));
});
document.addEventListener('submit', async event => {
  if (!pendingSaves.size) return;
  event.preventDefault();
  const form = event.target;
  const submitter = event.submitter;
  await Promise.all([...pendingSaves]);
  if (submitter) form.requestSubmit(submitter);
  else form.requestSubmit();
});
`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/tasks.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(taskScript);
    } else if (req.method === 'GET' && url.pathname === '/') {
      projectList(res);
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      const name = ((await readForm(req)).get('name') || '').trim();
      if (!name) return projectList(res, 'Project name is required');
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) return sendHtml(res, 404, 'Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>');
      projectPage(res, project, taskFilter(url.searchParams.get('filter')));
    } else if (req.method === 'POST' && /^\/projects\/\d+\/tasks(?:\/\d+)?$/.test(url.pathname)) {
      const [, , projectId, , taskId] = url.pathname.split('/');
      const project = findProject.get(projectId);
      if (!project) return sendHtml(res, 404, 'Not found', '<h1>Project not found</h1>');
      const form = await readForm(req);
      const filter = taskFilter(form.get('filter'));
      if (taskId) {
        const result = updateTask.run(form.get('completed') === '1' ? 1 : 0, taskId, project.id);
        if (!result.changes) return sendHtml(res, 404, 'Not found', '<h1>Task not found</h1>');
      } else {
        const title = (form.get('title') || '').trim();
        if (!title) return projectPage(res, project, filter, 'Task title is required');
        createTask.run(project.id, title);
      }
      redirect(res, `/projects/${project.id}?filter=${filter}`);
    } else {
      sendHtml(res, 404, 'Not found', '<h1>Page not found</h1>');
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, error.status || 500, 'Error', error.status === 413 ? '<h1>Request too large</h1>' : '<h1>Something went wrong</h1>');
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
