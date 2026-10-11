import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  default_task_priority TEXT NOT NULL DEFAULT 'Normal'
)`);
try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'Normal'
)`);
try { db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN task_order INTEGER'); } catch {}
db.exec('UPDATE tasks SET task_order = id WHERE task_order IS NULL');
// Keep a stable slot for each task in every project it has visited. The live
// task_order column describes current ordering; this table remembers ordering
// across moves away from and back to a project.
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_order INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, task_order)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, task_order)
  SELECT id, project_id, task_order FROM tasks`);

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 28px; font-size: 2rem; }
    form { display: flex; gap: 12px; align-items: end; margin-bottom: 24px; }
    label { display: grid; gap: 7px; flex: 1; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #aab5c2; border-radius: 6px; font: inherit; background: white; }
    button { padding: 10px 15px; border: 0; border-radius: 6px; background: #155eef; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #004eeb; }
    [role="alert"] { margin: 0 0 16px; color: #b42318; }
    #projects { display: grid; gap: 10px; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid #d0d5dd; border-radius: 8px; background: white; }
    [data-testid="project-row"] button { background: #344054; }
    .detail h1 { margin-bottom: 20px; }
    #tasks { display: grid; gap: 10px; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #d0d5dd; border-radius: 8px; background: white; }
    [data-testid="task-row"] input { width: auto; }
    .task-controls { margin-top: 22px; }
    @media (max-width: 520px) { main { padding: 28px 16px; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.querySelector('#app');
    const escapePath = (id) => '/projects/' + encodeURIComponent(id);
    async function loadProjects(filter = 'Active', query = '') {
      const response = await fetch('/api/projects?filter=' + encodeURIComponent(filter) + '&q=' + encodeURIComponent(query));
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    function renderList(projects, selectedFilter = 'Active', appliedQuery = '') {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const filterLabel = document.createElement('label'); filterLabel.textContent = 'Project filter';
      const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Project filter');
      for (const value of ['Active', 'Archived']) { const option = document.createElement('option'); option.value = value; option.textContent = value; filter.append(option); }
      filter.value = selectedFilter; filterLabel.append(filter); app.append(filterLabel);
      const searchLabel = document.createElement('label'); searchLabel.textContent = 'Project search';
      const searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.setAttribute('aria-label', 'Project search'); searchInput.value = appliedQuery; searchLabel.append(searchInput);
      const searchButton = document.createElement('button'); searchButton.type = 'button'; searchButton.textContent = 'Search projects';
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text'; input.name = 'projectName'; input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert'); alert.hidden = true;
      const list = document.createElement('section');
      list.id = 'projects';
      function updateRows(items) {
        list.replaceChildren();
        for (const project of items) {
        const row = document.createElement('div');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span'); name.textContent = project.name;
        const summary = document.createElement('span'); summary.dataset.testid = 'project-summary'; summary.textContent = project.completed_count + '/' + project.total_count + ' completed';
        const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = escapePath(project.id); });
        const archive = document.createElement('button'); archive.type = 'button'; archive.textContent = filter.value === 'Active' ? 'Archive project' : 'Restore project';
        archive.addEventListener('click', async () => {
          const result = await fetch('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: filter.value === 'Active' }) });
          if (result.ok) updateRows(await loadProjects(filter.value, searchQuery));
        });
          row.append(name, summary, open, archive); list.append(row);
        }
      }
      let searchQuery = appliedQuery;
      filter.addEventListener('change', async () => updateRows(await loadProjects(filter.value, searchQuery)));
      searchButton.addEventListener('click', async () => { searchQuery = searchInput.value.trim(); updateRows(await loadProjects(filter.value, searchQuery)); });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!response.ok) { alert.textContent = 'Could not create project'; alert.hidden = false; return; }
        location.href = '/';
      });
      app.append(searchLabel, searchButton, form, alert, list);
      updateRows(projects);
    }
    async function renderDetail(id) {
      const response = await fetch('/api/projects/' + encodeURIComponent(id));
      if (!response.ok) { app.textContent = 'Project not found'; return; }
      const project = await response.json();
      const section = document.createElement('section'); section.className = 'detail';
      const heading = document.createElement('h1'); heading.textContent = project.name;
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      section.append(heading, back);
      if (project.archived) { const archived = document.createElement('p'); archived.textContent = 'Archived project'; section.append(archived); }
      const renameForm = document.createElement('form'); renameForm.className = 'task-controls';
      const renameLabel = document.createElement('label'); renameLabel.textContent = 'New project name';
      const renameInput = document.createElement('input'); renameInput.type = 'text'; renameInput.setAttribute('aria-label', 'New project name'); renameInput.value = project.name;
      const renameButton = document.createElement('button'); renameButton.type = 'submit'; renameButton.textContent = 'Rename project';
      if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
      renameLabel.append(renameInput); renameForm.append(renameLabel, renameButton);
      const renameAlert = document.createElement('p'); renameAlert.setAttribute('role', 'alert'); renameAlert.hidden = true;
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault(); const name = renameInput.value.trim();
        if (!name) { renameAlert.textContent = 'Project name is required'; renameAlert.hidden = false; renameInput.focus(); return; }
        const result = await fetch('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!result.ok) { renameAlert.textContent = 'Could not rename project'; renameAlert.hidden = false; return; }
        project.name = name; heading.textContent = name; renameInput.value = name; renameAlert.hidden = true;
      });
      const defaultLabel = document.createElement('label'); defaultLabel.textContent = 'Default task priority';
      const defaultPriority = document.createElement('select'); defaultPriority.setAttribute('aria-label', 'Default task priority');
      for (const value of ['Low', 'Normal', 'High']) { const option = document.createElement('option'); option.value = value; option.textContent = value; defaultPriority.append(option); }
      defaultPriority.value = project.default_task_priority;
      defaultPriority.disabled = project.archived;
      defaultPriority.addEventListener('change', async () => {
        const previous = project.default_task_priority;
        const result = await fetch('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_task_priority: defaultPriority.value }) });
        if (!result.ok) { defaultPriority.value = previous; return; }
        project.default_task_priority = defaultPriority.value;
      });
      defaultLabel.append(defaultPriority);
      const form = document.createElement('form'); form.className = 'task-controls';
      const label = document.createElement('label'); label.textContent = 'Task title';
      const input = document.createElement('input'); input.type = 'text'; input.setAttribute('aria-label', 'Task title'); label.append(input);
      const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Create task'; form.append(label, submit);
      if (project.archived) { submit.disabled = true; input.disabled = true; }
      const alert = document.createElement('p'); alert.setAttribute('role', 'alert'); alert.hidden = true;
      const filterLabel = document.createElement('label'); filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Task filter');
      for (const value of ['All', 'Open', 'Completed']) { const option = document.createElement('option'); option.textContent = value; option.value = value; filter.append(option); }
      filterLabel.append(filter);
      const priorityFilterLabel = document.createElement('label'); priorityFilterLabel.textContent = 'Priority filter';
      const priorityFilter = document.createElement('select'); priorityFilter.setAttribute('aria-label', 'Priority filter');
      for (const value of ['All', 'Low', 'Normal', 'High']) { const option = document.createElement('option'); option.textContent = value; option.value = value; priorityFilter.append(option); }
      priorityFilterLabel.append(priorityFilter);
      const taskSearchLabel = document.createElement('label'); taskSearchLabel.textContent = 'Task search';
      const taskSearchInput = document.createElement('input'); taskSearchInput.type = 'text'; taskSearchInput.setAttribute('aria-label', 'Task search'); taskSearchLabel.append(taskSearchInput);
      const taskSearchButton = document.createElement('button'); taskSearchButton.type = 'button'; taskSearchButton.textContent = 'Search tasks';
      let taskSearchQuery = '';
      taskSearchButton.addEventListener('click', () => { taskSearchQuery = taskSearchInput.value.trim(); refreshTasks().catch(() => { list.textContent = 'Could not load tasks'; }); });
      const dueRange = { from: '', through: '' };
      const rangeLabelFrom = document.createElement('label'); rangeLabelFrom.textContent = 'Due from';
      const rangeFrom = document.createElement('input'); rangeFrom.type = 'text'; rangeFrom.setAttribute('aria-label', 'Due from'); rangeLabelFrom.append(rangeFrom);
      const rangeLabelThrough = document.createElement('label'); rangeLabelThrough.textContent = 'Due through';
      const rangeThrough = document.createElement('input'); rangeThrough.type = 'text'; rangeLabelThrough.append(rangeThrough);
      const applyRange = document.createElement('button'); applyRange.type = 'button'; applyRange.textContent = 'Apply due range';
      const rangeAlert = document.createElement('p'); rangeAlert.setAttribute('role', 'alert'); rangeAlert.hidden = true;
      const list = document.createElement('section'); list.id = 'tasks';
      let refreshVersion = 0;
      function isCalendarDate(value) {
        const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
        if (!match) return false;
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
      }
      applyRange.addEventListener('click', () => {
        const from = rangeFrom.value.trim(), through = rangeThrough.value.trim();
        if ((from && !isCalendarDate(from)) || (through && !isCalendarDate(through))) {
          rangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates'; rangeAlert.hidden = false; return;
        }
        if (from && through && from > through) {
          rangeAlert.textContent = 'Due from must not be after Due through'; rangeAlert.hidden = false; return;
        }
        dueRange.from = from; dueRange.through = through; rangeAlert.hidden = true;
        refreshTasks().catch(() => { list.textContent = 'Could not load tasks'; });
      });
      async function refreshTasks() {
        const version = ++refreshVersion;
        const [result, projectsResult] = await Promise.all([
          fetch('/api/projects/' + encodeURIComponent(id) + '/tasks'),
          loadProjects('Active')
        ]);
        if (version !== refreshVersion) return;
        if (!result.ok) throw new Error('Could not load tasks');
        const tasks = await result.json();
        const eligible = projectsResult;
        list.replaceChildren();
        for (const task of tasks) {
          if (!asciiIncludes(task.title, taskSearchQuery)) continue;
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
          if ((dueRange.from || dueRange.through) && !task.due_date) continue;
          if (dueRange.from && task.due_date < dueRange.from) continue;
          if (dueRange.through && task.due_date > dueRange.through) continue;
          const row = document.createElement('div'); row.dataset.testid = 'task-row';
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.completed;
          checkbox.disabled = project.archived;
          checkbox.setAttribute('aria-label', 'Complete ' + task.title);
          checkbox.addEventListener('change', async () => {
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
            if (!update.ok) { checkbox.checked = !checkbox.checked; return; }
            await refreshTasks();
          });
          const title = document.createElement('span'); title.textContent = task.title;
          const dueLabel = document.createElement('label'); dueLabel.textContent = 'Task due date';
          const dueInput = document.createElement('input'); dueInput.type = 'text'; dueInput.setAttribute('aria-label', 'Task due date'); dueInput.value = task.due_date || '';
          dueInput.disabled = project.archived;
          const dueButton = document.createElement('button'); dueButton.type = 'button'; dueButton.textContent = 'Save due date'; dueButton.disabled = project.archived;
          const dueAlert = document.createElement('span'); dueAlert.setAttribute('role', 'alert'); dueAlert.hidden = true;
          dueButton.addEventListener('click', async () => {
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: dueInput.value }) });
            if (!update.ok) { dueAlert.textContent = 'Due date must be a valid YYYY-MM-DD date'; dueAlert.hidden = false; return; }
            await refreshTasks();
          });
          dueLabel.append(dueInput);
          const priority = document.createElement('select'); priority.setAttribute('aria-label', 'Task priority');
          for (const value of ['Low', 'Normal', 'High']) { const option = document.createElement('option'); option.value = value; option.textContent = value; priority.append(option); }
          priority.value = task.priority;
          priority.disabled = project.archived;
          priority.addEventListener('change', async () => {
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
            if (!update.ok) { priority.value = task.priority; return; }
            await refreshTasks();
          });
          const renameLabel = document.createElement('label'); renameLabel.textContent = 'New task title';
          const renameInput = document.createElement('input'); renameInput.type = 'text'; renameInput.setAttribute('aria-label', 'New task title'); renameInput.value = task.title;
          const renameButton = document.createElement('button'); renameButton.type = 'button'; renameButton.textContent = 'Rename task';
          renameInput.disabled = project.archived; renameButton.disabled = project.archived;
          const renameAlert = document.createElement('span'); renameAlert.setAttribute('role', 'alert'); renameAlert.hidden = true;
          renameButton.addEventListener('click', async () => {
            const newTitle = renameInput.value.trim();
            if (!newTitle) { renameAlert.textContent = 'Task title is required'; renameAlert.hidden = false; renameInput.focus(); return; }
            const update = await fetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
            if (!update.ok) { renameAlert.textContent = 'Could not rename task'; renameAlert.hidden = false; return; }
            await refreshTasks();
          });
          renameLabel.append(renameInput); row.append(checkbox, title, priority, renameLabel, renameButton, renameAlert, dueLabel, dueButton, dueAlert);
          const destinationLabel = document.createElement('label'); destinationLabel.textContent = 'Destination project';
          const destination = document.createElement('select'); destination.setAttribute('aria-label', 'Destination project');
          const destinations = eligible.filter(item => String(item.id) !== String(id));
          for (const item of destinations) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; destination.append(option); }
          const move = document.createElement('button'); move.type = 'button'; move.textContent = 'Move task';
          destination.disabled = move.disabled = project.archived || destinations.length === 0;
          move.addEventListener('click', async () => {
            const result = await fetch('/api/tasks/' + encodeURIComponent(task.id) + '/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination_project_id: destination.value }) });
            if (result.ok) await refreshTasks();
          });
          destinationLabel.append(destination); row.append(destinationLabel, move);
          list.append(row);
        }
      }
      filter.addEventListener('change', () => refreshTasks().catch(() => { list.textContent = 'Could not load tasks'; }));
      priorityFilter.addEventListener('change', () => refreshTasks().catch(() => { list.textContent = 'Could not load tasks'; }));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); const title = input.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
        const created = await fetch('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
        if (!created.ok) { alert.textContent = 'Could not create task'; alert.hidden = false; return; }
        alert.hidden = true; input.value = ''; await refreshTasks();
      });
      section.append(renameForm, renameAlert, defaultLabel, form, alert, filterLabel, priorityFilterLabel, taskSearchLabel, taskSearchButton, rangeLabelFrom, rangeLabelThrough, applyRange, rangeAlert, list); app.replaceChildren(section); await refreshTasks();
    }
    function asciiLower(value) { return value.replace(/[A-Z]/g, character => String.fromCharCode(character.charCodeAt(0) + 32)); }
    function asciiIncludes(value, query) { return asciiLower(value).includes(asciiLower(query)); }
    const match = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);
    if (match) renderDetail(match[1]).catch(() => { app.textContent = 'Could not load project'; });
    else loadProjects().then(projects => renderList(projects)).catch(() => { app.textContent = 'Could not load projects'; });
  </script>
</body>
</html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const archived = url.searchParams.get('filter') === 'Archived' ? 1 : 0;
    const query = (url.searchParams.get('q') || '').trim().replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
    const projects = db.prepare(`SELECT p.id, p.name, p.archived,
      COUNT(t.id) AS total_count, COALESCE(SUM(t.completed), 0) AS completed_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`).all(archived).filter(p => {
        const name = p.name.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
        return !query || name.includes(query);
      }).map(p => ({...p, id: String(p.id), archived: Boolean(p.archived)}));
    return sendJson(res, 200, projects);
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJson(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return sendJson(res, 201, { id: String(result.lastInsertRowid), name });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    try {
      const body = await readJson(req);
      if (typeof body.default_task_priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.default_task_priority)) return sendJson(res, 400, { error: 'Invalid default task priority' });
        const result = db.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0').run(body.default_task_priority, projectMatch[1]);
        if (!result.changes) {
          const exists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectMatch[1]);
          return exists ? sendJson(res, 409, { error: 'Archived projects cannot change task defaults' }) : sendJson(res, 404, { error: 'Project not found' });
        }
        return sendJson(res, 200, { status: 'ok', default_task_priority: body.default_task_priority });
      }
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Project name is required' });
      const result = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0').run(name, projectMatch[1]);
      if (!result.changes) {
        const exists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectMatch[1]);
        return exists ? sendJson(res, 409, { error: 'Archived projects cannot be renamed' }) : sendJson(res, 404, { error: 'Project not found' });
      }
      return sendJson(res, 200, { status: 'ok', name });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && projectMatch) {
    const project = db.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?').get(projectMatch[1]);
    return project ? sendJson(res, 200, {...project, id: String(project.id), archived: Boolean(project.archived)}) : sendJson(res, 404, { error: 'Project not found' });
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (typeof body.archived !== 'boolean') return sendJson(res, 400, { error: 'Invalid archive state' });
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, archiveMatch[1]);
      return result.changes ? sendJson(res, 200, { status: 'ok' }) : sendJson(res, 404, { error: 'Project not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (tasksMatch && req.method === 'GET') {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(tasksMatch[1])) return sendJson(res, 404, { error: 'Project not found' });
    const tasks = db.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY task_order, id').all(tasksMatch[1]);
    return sendJson(res, 200, tasks.map((task) => ({ ...task, id: String(task.id), completed: Boolean(task.completed) })));
  }
  if (tasksMatch && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      const owner = db.prepare('SELECT archived, default_task_priority FROM projects WHERE id = ?').get(tasksMatch[1]);
      if (!owner) return sendJson(res, 404, { error: 'Project not found' });
      if (owner.archived) return sendJson(res, 409, { error: 'Archived projects cannot accept tasks' });
      const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(task_order), 0) + 1 AS value FROM tasks WHERE project_id = ?').get(tasksMatch[1]).value);
      const result = db.prepare('INSERT INTO tasks (project_id, title, priority, task_order) VALUES (?, ?, ?, ?)').run(tasksMatch[1], title, owner.default_task_priority, nextOrder);
      const rememberedOrder = Number(db.prepare('SELECT COALESCE(MAX(task_order), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(tasksMatch[1]).value);
      db.prepare('INSERT INTO task_project_positions (task_id, project_id, task_order) VALUES (?, ?, ?)').run(result.lastInsertRowid, tasksMatch[1], rememberedOrder);
      return sendJson(res, 201, { id: String(result.lastInsertRowid), title, completed: false, priority: owner.default_task_priority });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const moveMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
  if (moveMatch && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const destinationId = String(body.destination_project_id ?? '');
      if (!/^\d+$/.test(destinationId)) return sendJson(res, 400, { error: 'Invalid destination project' });
      const task = db.prepare('SELECT tasks.project_id, projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(moveMatch[1]);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });
      if (task.archived) return sendJson(res, 409, { error: 'Archived projects cannot move tasks' });
      const destination = db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0').get(destinationId);
      if (!destination || String(task.project_id) === destinationId) return sendJson(res, 400, { error: 'Invalid destination project' });
      db.exec('BEGIN IMMEDIATE');
      try {
        let remembered = db.prepare('SELECT task_order FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(moveMatch[1], destinationId);
        if (!remembered) {
          const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(task_order), 0) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value);
          db.prepare('INSERT INTO task_project_positions (task_id, project_id, task_order) VALUES (?, ?, ?)').run(moveMatch[1], destinationId, nextOrder);
          remembered = { task_order: nextOrder };
        }
        const position = Number(remembered.task_order);
        // Vacate the historical slot before restoring the task into it.
        db.prepare('UPDATE tasks SET task_order = task_order + 1 WHERE project_id = ? AND task_order >= ?').run(destinationId, position);
        db.prepare('UPDATE tasks SET project_id = ?, task_order = ? WHERE id = ?').run(destinationId, position, moveMatch[1]);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return sendJson(res, 200, { status: 'ok' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (taskMatch && req.method === 'PATCH') {
    try {
      const body = await readJson(req);
      let result;
      if (Object.hasOwn(body, 'due_date')) {
        if (typeof body.due_date !== 'string') return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
        const value = body.due_date.trim();
        let canonical = null;
        if (value) {
          const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!match) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
          const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
          const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return sendJson(res, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
          canonical = value;
        }
        result = db.prepare(`UPDATE tasks SET due_date = ? WHERE id = ?
          AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND projects.archived = 0)`).run(canonical, taskMatch[1]);
        if (!result.changes) {
          const task = db.prepare('SELECT projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(taskMatch[1]);
          return task ? sendJson(res, 409, { error: 'Archived projects cannot change task due dates' }) : sendJson(res, 404, { error: 'Task not found' });
        }
      } else if (typeof body.completed === 'boolean') {
        result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(body.completed ? 1 : 0, taskMatch[1]);
      } else if (typeof body.priority === 'string') {
        if (!['Low', 'Normal', 'High'].includes(body.priority)) return sendJson(res, 400, { error: 'Invalid task priority' });
        result = db.prepare(`UPDATE tasks SET priority = ? WHERE id = ?
          AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND projects.archived = 0)`).run(body.priority, taskMatch[1]);
        if (!result.changes) {
          const task = db.prepare('SELECT projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(taskMatch[1]);
          return task ? sendJson(res, 409, { error: 'Archived projects cannot change task priority' }) : sendJson(res, 404, { error: 'Task not found' });
        }
      } else if (typeof body.title === 'string') {
        const title = body.title.trim();
        if (!title) return sendJson(res, 400, { error: 'Task title is required' });
        result = db.prepare(`UPDATE tasks SET title = ? WHERE id = ?
          AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND projects.archived = 0)`).run(title, taskMatch[1]);
        if (!result.changes) {
          const task = db.prepare('SELECT projects.archived FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ?').get(taskMatch[1]);
          return task ? sendJson(res, 409, { error: 'Archived projects cannot rename tasks' }) : sendJson(res, 404, { error: 'Task not found' });
        }
      } else return sendJson(res, 400, { error: 'Invalid task update' });
      return result.changes ? sendJson(res, 200, { status: 'ok' }) : sendJson(res, 404, { error: 'Task not found' });
    } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0');
