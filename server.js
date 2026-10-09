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

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const page = (title, content) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — Workboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#192334;font:16px system-ui,sans-serif}main{max-width:760px;margin:64px auto;padding:0 24px}h1{font-size:36px;margin:0 0 30px}h2{font-size:20px;margin-top:36px}.panel,.project-row{background:white;border:1px solid #dce2ec;border-radius:10px;padding:20px}.panel label{display:block;font-weight:600;margin-bottom:8px}.input-line{display:flex;gap:12px;flex-wrap:wrap}input{font:inherit;border:1px solid #8996aa;border-radius:6px;padding:10px;flex:1;min-width:180px}button{font:inherit;cursor:pointer;border:0;border-radius:6px;background:#245ac5;color:white;padding:11px 16px}button:hover{background:#19469e}button:focus-visible,input:focus-visible{outline:3px solid #e69b22;outline-offset:3px}.project-row{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:12px 0}.project-name{overflow-wrap:anywhere;min-width:0}.project-row form{flex-shrink:0}[role=alert]{color:#a51926;margin-bottom:16px}.empty{color:#5b6779}
</style></head><body><main>${content}</main></body></html>`;

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/') {
      projectList(res);
    } else if (req.method === 'POST' && url.pathname === '/projects') {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024 * 1024) {
          sendHtml(res, 413, 'Request too large', '<h1>Request too large</h1>');
          return;
        }
      }
      const name = (new URLSearchParams(body).get('name') || '').trim();
      if (!name) return projectList(res, 'Project name is required');
      createProject.run(name);
      res.writeHead(303, { Location: '/' });
      res.end();
    } else if (req.method === 'GET' && /^\/projects\/\d+$/.test(url.pathname)) {
      const project = findProject.get(url.pathname.split('/')[2]);
      if (!project) return sendHtml(res, 404, 'Not found', '<h1>Project not found</h1><form action="/"><button>Projects</button></form>');
      sendHtml(res, 200, project.name, `<h1>${escape(project.name)}</h1><form method="get" action="/"><button type="submit">Projects</button></form>`);
    } else {
      sendHtml(res, 404, 'Not found', '<h1>Page not found</h1>');
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendHtml(res, 500, 'Error', '<h1>Something went wrong</h1>');
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
