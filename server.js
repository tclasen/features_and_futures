import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
)`);
// The duplicate-column error is ignored for databases created by earlier versions.
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS totalCount,
  SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completedCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const getProject = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
const updateProject = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
const insertTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const getTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workboard</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 760px; margin: 3rem auto; padding: 0 1.25rem; color: #17212b; }
  h1 { margin-bottom: 1.5rem; } form { display: flex; gap: .6rem; flex-wrap: wrap; }
  input, button { font: inherit; padding: .55rem .75rem; } input { flex: 1; min-width: 220px; }
  button { cursor: pointer; } .project-row { display:flex; align-items:center; justify-content:space-between; border:1px solid #ccd4dc; border-radius:6px; padding:.75rem 1rem; margin:.6rem 0; }
  [role=alert] { color:#a11; margin-top:.75rem; }
</style></head><body><main id="app"></main><script>
const app = document.querySelector('#app');
function heading(text) { const h = document.createElement('h1'); h.textContent = text; return h; }
function button(label, action) { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click', action); return b; }
function go(path) { history.pushState({}, '', path); render(); }
async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
  if (match) {
    const response = await fetch('/api/projects/' + match[1]);
    if (response.ok) {
      const project = await response.json();
      app.append(heading(project.name), button('Projects', () => go('/')));
      if (project.archived) { const notice=document.createElement('p'); notice.textContent='Archived project'; app.append(notice); }
      const renameForm=document.createElement('form');
      const renameInput=document.createElement('input'); renameInput.type='text'; renameInput.setAttribute('aria-label','New project name'); renameInput.value=project.name;
      const renameButton=document.createElement('button'); renameButton.type='submit'; renameButton.textContent='Rename project';
      const renameAlert=document.createElement('div'); renameAlert.setAttribute('role','alert'); renameAlert.hidden=true;
      if (project.archived) { renameInput.disabled=true; renameButton.disabled=true; }
      renameForm.append(renameInput,renameButton); app.append(renameForm,renameAlert);
      renameForm.addEventListener('submit',async event=>{
        event.preventDefault(); const name=renameInput.value.trim();
        if (!name) { renameAlert.textContent='Project name is required'; renameAlert.hidden=false; return; }
        const result=await fetch('/api/projects/'+project.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
        if (result.ok) render();
      });
      const form = document.createElement('form');
      const input = document.createElement('input'); input.type='text'; input.setAttribute('aria-label','Task title');
      const submit = document.createElement('button'); submit.type='submit'; submit.textContent='Create task';
      const alert = document.createElement('div'); alert.setAttribute('role','alert'); alert.hidden=true;
      if (project.archived) submit.disabled=true;
      form.append(input, submit); app.append(form, alert);
      const filterLabel = document.createElement('label'); filterLabel.textContent='Task filter';
      const filter = document.createElement('select'); filter.setAttribute('aria-label','Task filter');
      for (const value of ['All','Open','Completed']) { const option=document.createElement('option'); option.value=value; option.textContent=value; filter.append(option); }
      filterLabel.append(filter); app.append(filterLabel);
      form.addEventListener('submit', async event => {
        event.preventDefault(); const title=input.value.trim();
        if (!title) { alert.textContent='Task title is required'; alert.hidden=false; return; }
        const result=await fetch('/api/projects/'+project.id+'/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});
        if (result.ok) { input.value=''; alert.hidden=true; await loadTasks(); }
      });
      filter.addEventListener('change', loadTasks);
      await loadTasks();
      async function loadTasks() {
        const tasks=await (await fetch('/api/projects/'+project.id+'/tasks')).json();
        app.querySelectorAll('[data-testid="task-row"]').forEach(row=>row.remove());
        for (const task of tasks) {
          if (filter.value==='Open' && task.completed || filter.value==='Completed' && !task.completed) continue;
          const row=document.createElement('div'); row.dataset.testid='task-row'; row.className='project-row';
          const title=document.createElement('span'); title.textContent=task.title;
          const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.checked=Boolean(task.completed); checkbox.disabled=Boolean(project.archived); checkbox.setAttribute('aria-label','Complete '+task.title);
          checkbox.addEventListener('change', async () => { await fetch('/api/projects/'+project.id+'/tasks/'+task.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:checkbox.checked})}); await loadTasks(); });
          row.append(title, checkbox);
          const renameInput=document.createElement('input'); renameInput.type='text'; renameInput.setAttribute('aria-label','New task title'); renameInput.value=task.title; renameInput.disabled=Boolean(project.archived);
          const renameButton=document.createElement('button'); renameButton.type='button'; renameButton.textContent='Rename task'; renameButton.disabled=Boolean(project.archived);
          renameButton.addEventListener('click',async()=>{
            const newTitle=renameInput.value.trim();
            let alert=app.querySelector('[data-task-alert]');
            if (!alert) { alert=document.createElement('div'); alert.setAttribute('role','alert'); alert.dataset.taskAlert='true'; app.insertBefore(alert,filterLabel); }
            if (!newTitle) { alert.textContent='Task title is required'; return; }
            const result=await fetch('/api/projects/'+project.id+'/tasks/'+task.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:newTitle})});
            if (result.ok) { alert.remove(); await loadTasks(); }
          });
          row.append(renameInput,renameButton); app.append(row);
        }
      }
      return;
    }
    go('/'); return;
  }
  app.append(heading('Workboard'));
  const filter=document.createElement('select'); filter.setAttribute('aria-label','Project filter');
  for (const value of ['Active','Archived']) { const option=document.createElement('option'); option.value=value; option.textContent=value; filter.append(option); }
  app.append(filter);
  const form = document.createElement('form');
  const input = document.createElement('input'); input.type='text'; input.setAttribute('aria-label','Project name');
  const submit = document.createElement('button'); submit.type='submit'; submit.textContent='Create project';
  const alert = document.createElement('div'); alert.setAttribute('role','alert'); alert.hidden=true;
  form.append(input, submit); app.append(form, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault(); const name=input.value.trim();
    if (!name) { alert.textContent='Project name is required'; alert.hidden=false; return; }
    const response=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
    if (response.ok) { input.value=''; await loadRows(); }
  });
  filter.addEventListener('change', loadRows);
  await loadRows();
  async function loadRows() {
    const projects=await (await fetch('/api/projects?filter='+filter.value)).json();
    app.querySelectorAll('[data-testid="project-row"]').forEach(row=>row.remove());
    for (const project of projects) {
      const row=document.createElement('div'); row.dataset.testid='project-row'; row.className='project-row';
      const name=document.createElement('span'); name.textContent=project.name;
      const summary=document.createElement('span'); summary.dataset.testid='project-summary'; summary.textContent=(project.completedCount||0)+'/'+project.totalCount+' completed';
      row.append(name, summary, button('Open project',()=>go('/projects/'+project.id)));
      row.append(button(project.archived ? 'Restore project' : 'Archive project', async () => {
        await fetch('/api/projects/'+project.id+'/archive',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:!project.archived})}); await loadRows();
      })); app.append(row);
    }
  }
}
addEventListener('popstate', render); render();
</script></body></html>`;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/projects') return send(response, 200, listProjects.all(url.searchParams.get('filter') === 'Archived' ? 1 : 0));
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      let raw=''; for await (const chunk of request) raw+=chunk;
      const data=JSON.parse(raw); if (typeof data.archived !== 'boolean') return send(response,400,{error:'Invalid archive state'});
      const id=Number(archiveMatch[1]); if (!getProject.get(id)) return send(response,404,{error:'Not found'});
      updateProject.run(data.archived ? 1 : 0,id); return send(response,200,{ok:true});
    } catch { return send(response,400,{error:'Invalid request'}); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!getProject.get(projectId)) return send(response, 404, { error: 'Not found' });
    if (request.method === 'GET' && !tasksMatch[2]) return send(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed) })));
    if (request.method === 'POST' && !tasksMatch[2]) {
      if (getProject.get(projectId).archived) return send(response, 403, { error: 'Archived project' });
      try {
        let raw = ''; for await (const chunk of request) raw += chunk;
        const data = JSON.parse(raw); const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return send(response, 400, { error: 'Task title is required' });
        const result = insertTask.run(projectId, title);
        return send(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false });
      } catch { return send(response, 400, { error: 'Invalid request' }); }
    }
    if (request.method === 'PATCH' && tasksMatch[2]) {
      if (getProject.get(projectId).archived) return send(response, 403, { error: 'Archived project' });
      try {
        let raw = ''; for await (const chunk of request) raw += chunk;
        const data = JSON.parse(raw);
        const taskId = Number(tasksMatch[2]);
        if (!getTask.get(taskId, projectId)) return send(response, 404, { error: 'Not found' });
        if (typeof data.title === 'string') {
          const title=data.title.trim();
          if (!title) return send(response,400,{error:'Task title is required'});
          renameTask.run(title,taskId,projectId);
          return send(response,200,{ok:true});
        }
        if (typeof data.completed !== 'boolean') return send(response, 400, { error: 'Invalid completion state' });
        updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        return send(response, 200, { ok: true });
      } catch { return send(response, 400, { error: 'Invalid request' }); }
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && request.method === 'PATCH') {
    try {
      let raw=''; for await (const chunk of request) raw+=chunk;
      const data=JSON.parse(raw); const name=typeof data.name==='string' ? data.name.trim() : '';
      const project=getProject.get(Number(projectMatch[1]));
      if (!project) return send(response,404,{error:'Not found'});
      if (project.archived) return send(response,403,{error:'Archived project'});
      if (!name) return send(response,400,{error:'Project name is required'});
      renameProject.run(name,project.id); return send(response,200,{ok:true});
    } catch { return send(response,400,{error:'Invalid request'}); }
  }
  if (request.method === 'GET' && projectMatch) {
    const project = getProject.get(Number(projectMatch[1]));
    return project ? send(response, 200, project) : send(response, 404, { error: 'Not found' });
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let raw = '';
    try {
      for await (const chunk of request) raw += chunk;
      const data = JSON.parse(raw);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) return send(response, 400, { error: 'Project name is required' });
      const result = insertProject.run(name);
      return send(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      return send(response, 400, { error: 'Invalid request' });
    }
  }
  if (request.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    return send(response, 200, page, 'text/html; charset=utf-8');
  }
  send(response, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log(`Workboard listening on ${port}`));
