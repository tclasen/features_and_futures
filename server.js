import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 8080);
const dbPath = resolve(process.env.DB_PATH || './workboard.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
)`);
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal'");
}
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))
)`);
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  const tasksToOrder = db.prepare('SELECT id, project_id AS projectId FROM tasks ORDER BY project_id, id').all();
  const nextOrder = new Map();
  const setOrder = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
  for (const task of tasksToOrder) {
    const order = nextOrder.get(task.projectId) || 0;
    setOrder.run(order, task.id);
    nextOrder.set(task.projectId, order + 1);
  }
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
}
// Keep a durable position for every task in every project it has visited.
// Existing tasks are seeded from their current order when this feature is added.
db.exec(`CREATE TABLE IF NOT EXISTS task_project_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, sort_order)
)`);
db.exec(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order)
  SELECT id, project_id, sort_order FROM tasks`);
db.exec('PRAGMA foreign_keys = ON');
const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed = 1 AND t.deleted = 0) AS completedCount,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted = 0) AS totalCount
  FROM projects p WHERE p.archived = ? ORDER BY p.id ASC`);
const findProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const addProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
const setArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const listTasks = db.prepare(`SELECT t.id, t.project_id AS projectId, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes
  , t.deleted
  FROM tasks t JOIN task_project_positions pos ON pos.task_id = t.id AND pos.project_id = t.project_id
  WHERE t.project_id = ? ORDER BY pos.sort_order ASC, t.id ASC`);
const addTask = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updatePriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const updateDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; padding: 3rem 1.25rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #dce2ec; border-radius: 12px; box-shadow: 0 8px 24px #1720330b; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: .4rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: .65rem .75rem; border: 1px solid #9aa6b8; border-radius: 6px; font: inherit; }
    .field { flex: 1; }
    button { padding: .65rem 1rem; border: 0; border-radius: 6px; color: white; background: #2457c5; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1946a7; }
    button:focus-visible, input:focus-visible { outline: 3px solid #80aaff; outline-offset: 2px; }
    #error { color: #a11b1b; margin: 0 0 1rem; }
    #projects { list-style: none; margin: 0; padding: 0; }
    .task-controls { display: flex; gap: .75rem; margin: 1.5rem 0; }
    .task-controls .field { flex: 1; }
    select { box-sizing: border-box; padding: .65rem .75rem; border: 1px solid #9aa6b8; border-radius: 6px; font: inherit; background: white; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .75rem; padding: .8rem 0; border-top: 1px solid #e5e9f0; }
    [data-testid="task-row"] label { margin: 0; font-weight: 400; }
    [data-testid="task-row"] input { width: auto; }
    [data-testid="task-row"] input[type="text"] { flex: 1; min-width: 5rem; }
    [data-testid="task-row"] textarea { min-width: 8rem; min-height: 3rem; font: inherit; }
    [data-testid="project-row"] { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 0; border-top: 1px solid #e5e9f0; }
    .project-name { overflow-wrap: anywhere; }
    @media (max-width: 480px) { body { padding: 1rem .75rem; } main { padding: 1.25rem; } form { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script type="module">
    const app = document.querySelector('#app');
    const escPath = location.pathname.match(/^\\/projects\\/(\\d+)\\/?$/);

    async function request(url, options) {
      const response = await fetch(url, options);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Request failed');
      return value;
    }

    function asciiLower(value) {
      return value.replace(/[A-Z]/g, letter => String.fromCharCode(letter.charCodeAt(0) + 32));
    }

    function normalizeSearch(value, query = false) {
      const trimmed = query ? value.trim() : value;
      return asciiLower(trimmed.replace(/[ \\t]+/g, ' '));
    }

    function renderList(projects, selectedFilter = 'Active') {
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      const directoryButton = document.createElement('button');
      directoryButton.type = 'button'; directoryButton.textContent = 'Task directory';
      directoryButton.addEventListener('click', () => { location.href = '/directory'; });
      const form = document.createElement('form');
      form.noValidate = true;
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = 'project-name';
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.id = 'project-name';
      input.name = 'projectName';
      input.type = 'text';
      input.autocomplete = 'off';
      field.append(label, input);
      const create = document.createElement('button');
      create.type = 'submit';
      create.textContent = 'Create project';
      form.append(field, create);
      const error = document.createElement('p');
      error.id = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const importForm = document.createElement('form');
      importForm.noValidate = true;
      const jsonLabel = document.createElement('label');
      jsonLabel.htmlFor = 'project-json';
      jsonLabel.textContent = 'Project JSON';
      const jsonInput = document.createElement('textarea');
      jsonInput.id = 'project-json';
      jsonInput.setAttribute('aria-label', 'Project JSON');
      const overrideLabel = document.createElement('label');
      overrideLabel.htmlFor = 'imported-project-name';
      overrideLabel.textContent = 'Imported project name';
      const overrideInput = document.createElement('input');
      overrideInput.id = 'imported-project-name';
      overrideInput.type = 'text';
      const importButton = document.createElement('button');
      importButton.type = 'submit';
      importButton.textContent = 'Import project';
      importForm.append(jsonLabel, jsonInput, overrideLabel, overrideInput, importButton);
      importForm.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          const result = await request('/api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: jsonInput.value, name: overrideInput.value }) });
          location.href = '/projects/' + encodeURIComponent(result.id);
        } catch (failure) {
          error.textContent = failure.message === 'Project name is required' ? failure.message : 'Invalid project JSON';
          error.hidden = false;
        }
      });
      const projectFilterLabel = document.createElement('label');
      projectFilterLabel.htmlFor = 'project-filter';
      projectFilterLabel.textContent = 'Project filter';
      const projectFilter = document.createElement('select');
      projectFilter.id = 'project-filter';
      for (const value of ['Active', 'Archived']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        projectFilter.append(option);
      }
      projectFilter.value = selectedFilter;
      const searchField = document.createElement('div');
      searchField.className = 'field';
      const searchLabel = document.createElement('label');
      searchLabel.htmlFor = 'project-search';
      searchLabel.textContent = 'Project search';
      const searchInput = document.createElement('input');
      searchInput.id = 'project-search';
      searchInput.type = 'text';
      const searchButton = document.createElement('button');
      searchButton.type = 'button';
      searchButton.textContent = 'Search projects';
      searchField.append(searchLabel, searchInput);
      let appliedSearch = '';
      const list = document.createElement('ul');
      list.id = 'projects';
      function drawProjects(items) {
        list.replaceChildren();
        const query = normalizeSearch(appliedSearch, true);
        for (const project of items.filter(item => normalizeSearch(item.name).includes(query))) {
          const row = document.createElement('li');
          row.dataset.testid = 'project-row';
          const name = document.createElement('span');
          name.className = 'project-name';
          name.textContent = project.name;
          const open = document.createElement('button');
          open.type = 'button';
          open.textContent = 'Open project';
          open.addEventListener('click', () => { location.href = '/projects/' + encodeURIComponent(project.id); });
          const summary = document.createElement('span');
          summary.dataset.testid = 'project-summary';
          summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
          const actions = document.createElement('div');
          actions.append(open);
          const archive = document.createElement('button');
          archive.type = 'button';
          archive.textContent = project.archived ? 'Restore project' : 'Archive project';
          archive.addEventListener('click', async () => {
            await request('/api/projects/' + encodeURIComponent(project.id) + '/archive', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
            const updated = await request('/api/projects?filter=' + projectFilter.value.toLowerCase());
            drawProjects(updated);
          });
          actions.append(archive);
          row.append(name, summary, actions);
          list.append(row);
        }
      }
      drawProjects(projects);
      projectFilter.addEventListener('change', async () => {
        const selected = projectFilter.value;
        drawProjects(await request('/api/projects?filter=' + selected.toLowerCase()));
      });
      searchButton.addEventListener('click', async () => {
        appliedSearch = searchInput.value.trim();
        drawProjects(await request('/api/projects?filter=' + projectFilter.value.toLowerCase()));
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          error.textContent = 'Project name is required';
          error.hidden = false;
          input.focus();
          return;
        }
        error.hidden = true;
        try {
          await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          const updated = await request('/api/projects?filter=' + projectFilter.value.toLowerCase());
          input.value = '';
          drawProjects(updated);
        } catch {
          error.textContent = 'Unable to create project';
          error.hidden = false;
        }
      });
      app.append(heading, directoryButton, form, importForm, error, projectFilterLabel, projectFilter, searchField, searchButton, list);
    }

    async function renderDirectory() {
      app.replaceChildren();
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1'); heading.textContent = 'Task directory';
      const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.hidden = true;
      const active = await request('/api/projects?filter=active');
      const archived = await request('/api/projects?filter=archived');
      const projects = [...active.map(p => ({ ...p, archived: false })), ...archived.map(p => ({ ...p, archived: true }))].sort((a,b) => Number(a.id)-Number(b.id));
      const records = [];
      for (const project of projects) for (const task of await request('/api/projects/' + encodeURIComponent(project.id) + '/tasks')) records.push({ ...task, owner: project });
      const selectField = (labelText, id, values) => {
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = labelText;
        const select = document.createElement('select'); select.id = id;
        for (const value of values) { const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option); }
        return [label, select];
      };
      const inputField = (labelText, id) => { const label = document.createElement('label'); label.htmlFor = id; label.textContent = labelText; const input = document.createElement('input'); input.id=id; input.type='text'; return [label,input]; };
      const [scopeLabel, scope] = selectField('Project scope','directory-scope',['Active','Archived']);
      const [taskFilterLabel, taskFilter] = selectField('Task filter','directory-task-filter',['All','Open','Completed','Deleted']);
      const [priorityLabel, priority] = selectField('Priority filter','directory-priority-filter',['All','Low','Normal','High']);
      const [searchLabel, search] = inputField('Directory search','directory-search');
      const searchButton = document.createElement('button'); searchButton.type='button'; searchButton.textContent='Search directory';
      const [fromLabel, from] = inputField('Due from','directory-due-from'); from.placeholder='YYYY-MM-DD';
      const [throughLabel, through] = inputField('Due through','directory-due-through'); through.placeholder='YYYY-MM-DD';
      const apply = document.createElement('button'); apply.type='button'; apply.textContent='Apply due range';
      let appliedSearch='', appliedFrom='', appliedThrough='';
      const list = document.createElement('ul'); list.style.cssText='list-style:none;padding:0';
      const validDate = value => {
        const m=value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); if(!m)return false;
        const y=+m[1], mo=+m[2], d=+m[3], leap=y%4===0&&(y%100!==0||y%400===0);
        return y>=1&&mo>=1&&mo<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][mo-1];
      };
      function draw() {
        list.replaceChildren(); const query=normalizeSearch(appliedSearch,true);
        for(const task of records.filter(t => t.owner.archived===(scope.value==='Archived') &&
          (taskFilter.value==='Deleted'?Boolean(t.deleted):!t.deleted&&(taskFilter.value==='All'||(taskFilter.value==='Completed')===Boolean(t.completed))) &&
          (priority.value==='All'||t.priority===priority.value) && (!appliedFrom&&!appliedThrough||Boolean(t.dueDate)) &&
          (!appliedFrom||t.dueDate>=appliedFrom)&&(!appliedThrough||t.dueDate<=appliedThrough)&&normalizeSearch(t.title).includes(query))) {
          const row=document.createElement('li'); row.dataset.testid='directory-task-row'; row.style.cssText='border-top:1px solid #e5e9f0;padding:.8rem 0';
          const field=(id,value)=>{const s=document.createElement('span');s.dataset.testid=id;s.textContent=value;return s;};
          const title=field('directory-task-title',task.title), owner=field('directory-project-name',task.owner.name);
          const completion=field('directory-task-completion',task.completed?'Completed':'Open');
          const prio=field('directory-task-priority',task.priority||'Normal'), due=field('directory-task-due-date',task.dueDate||'');
          const notes=field('directory-task-notes',task.notes||''); notes.style.whiteSpace='pre-wrap';
          const open=document.createElement('button');open.type='button';open.textContent='Open project';open.addEventListener('click',()=>{location.href='/projects/'+encodeURIComponent(task.owner.id);});
          row.append(title,document.createTextNode(' · '),owner,document.createTextNode(' · '),completion,document.createTextNode(' · '),prio,document.createTextNode(' · '),due,document.createTextNode(' · '),notes,open); list.append(row);
        }
      }
      for(const control of [scope,taskFilter,priority]) control.addEventListener('change',draw);
      searchButton.addEventListener('click',()=>{appliedSearch=search.value.trim();draw();});
      apply.addEventListener('click',()=>{const a=from.value.trim(),b=through.value.trim();if((a&&!validDate(a))||(b&&!validDate(b))){from.value=appliedFrom;through.value=appliedThrough;error.textContent='Due range must use valid YYYY-MM-DD dates';error.hidden=false;return;}if(a&&b&&a>b){from.value=appliedFrom;through.value=appliedThrough;error.textContent='Due from must not be after Due through';error.hidden=false;return;}appliedFrom=a;appliedThrough=b;from.value=a;through.value=b;error.hidden=true;draw();});
      app.append(back,heading,scopeLabel,scope,taskFilterLabel,taskFilter,priorityLabel,priority,searchLabel,search,searchButton,fromLabel,from,throughLabel,through,apply,error,list); draw();
    }

    async function renderProject(id) {
      const project = await request('/api/projects/' + encodeURIComponent(id));
      app.replaceChildren();
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      const heading = document.createElement('h1');
      heading.textContent = project.name;
      const download = document.createElement('button');
      download.type = 'button';
      download.textContent = 'Download project';
      download.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/api/projects/' + encodeURIComponent(id) + '/export';
        link.download = 'workboard-project.json';
        document.body.append(link);
        link.click();
        link.remove();
      });
      const renameForm = document.createElement('form');
      renameForm.noValidate = true;
      const renameField = document.createElement('div');
      renameField.className = 'field';
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = 'new-project-name';
      renameLabel.textContent = 'New project name';
      const renameInput = document.createElement('input');
      renameInput.id = 'new-project-name';
      renameInput.type = 'text';
      renameInput.value = project.name;
      renameInput.disabled = Boolean(project.archived);
      renameField.append(renameLabel, renameInput);
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename project';
      renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameField, renameButton);
      const archived = document.createElement('p');
      archived.textContent = 'Archived project';
      archived.hidden = !project.archived;
      const defaultPriorityLabel = document.createElement('label');
      defaultPriorityLabel.htmlFor = 'default-task-priority';
      defaultPriorityLabel.textContent = 'Default task priority';
      const defaultPriority = document.createElement('select');
      defaultPriority.id = 'default-task-priority';
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        defaultPriority.append(option);
      }
      defaultPriority.value = project.defaultPriority || 'Normal';
      defaultPriority.disabled = Boolean(project.archived);
      defaultPriority.addEventListener('change', async () => {
        try {
          const updated = await request('/api/projects/' + encodeURIComponent(id) + '/default-priority', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: defaultPriority.value }) });
          project.defaultPriority = updated.defaultPriority;
        } catch { defaultPriority.value = project.defaultPriority || 'Normal'; }
      });
      const form = document.createElement('form');
      form.className = 'task-controls';
      form.noValidate = true;
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = 'task-title';
      label.textContent = 'Task title';
      const input = document.createElement('input');
      input.id = 'task-title';
      input.type = 'text';
      field.append(label, input);
      const create = document.createElement('button');
      create.type = 'submit';
      create.textContent = 'Create task';
      create.disabled = Boolean(project.archived);
      form.append(field, create);
      const error = document.createElement('p');
      error.id = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        const name = renameInput.value.trim();
        if (!name) {
          error.textContent = 'Project name is required';
          error.hidden = false;
          renameInput.focus();
          return;
        }
        try {
          const updated = await request('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          project.name = updated.name;
          heading.textContent = updated.name;
          error.hidden = true;
        } catch {
          error.textContent = 'Unable to rename project';
          error.hidden = false;
        }
      });
      const filterLabel = document.createElement('label');
      filterLabel.htmlFor = 'task-filter';
      filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select');
      filter.id = 'task-filter';
      for (const value of ['All', 'Open', 'Completed', 'Deleted']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        filter.append(option);
      }
      const priorityFilterLabel = document.createElement('label');
      priorityFilterLabel.htmlFor = 'priority-filter';
      priorityFilterLabel.textContent = 'Priority filter';
      const priorityFilter = document.createElement('select');
      priorityFilter.id = 'priority-filter';
      for (const value of ['All', 'Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priorityFilter.append(option);
      }
      const taskSearchField = document.createElement('div');
      taskSearchField.className = 'field';
      const taskSearchLabel = document.createElement('label');
      taskSearchLabel.htmlFor = 'task-search';
      taskSearchLabel.textContent = 'Task search';
      const taskSearchInput = document.createElement('input');
      taskSearchInput.id = 'task-search';
      taskSearchInput.type = 'text';
      const taskSearchButton = document.createElement('button');
      taskSearchButton.type = 'button';
      taskSearchButton.textContent = 'Search tasks';
      taskSearchField.append(taskSearchLabel, taskSearchInput);
      let appliedTaskSearch = '';
      const dueRange = document.createElement('div');
      dueRange.className = 'task-controls';
      const dueFromField = document.createElement('div');
      dueFromField.className = 'field';
      const dueFromLabel = document.createElement('label');
      dueFromLabel.htmlFor = 'due-from';
      dueFromLabel.textContent = 'Due from';
      const dueFrom = document.createElement('input');
      dueFrom.id = 'due-from';
      dueFrom.type = 'text';
      dueFrom.placeholder = 'YYYY-MM-DD';
      dueFromField.append(dueFromLabel, dueFrom);
      const dueThroughField = document.createElement('div');
      dueThroughField.className = 'field';
      const dueThroughLabel = document.createElement('label');
      dueThroughLabel.htmlFor = 'due-through';
      dueThroughLabel.textContent = 'Due through';
      const dueThrough = document.createElement('input');
      dueThrough.id = 'due-through';
      dueThrough.type = 'text';
      dueThrough.placeholder = 'YYYY-MM-DD';
      dueThroughField.append(dueThroughLabel, dueThrough);
      const applyDueRange = document.createElement('button');
      applyDueRange.type = 'button';
      applyDueRange.textContent = 'Apply due range';
      dueRange.append(dueFromField, dueThroughField, applyDueRange);
      let appliedFrom = '';
      let appliedThrough = '';
      const tasksList = document.createElement('ul');
      tasksList.id = 'tasks';
      tasksList.style.listStyle = 'none';
      tasksList.style.margin = '0';
      tasksList.style.padding = '0';
      let tasks = await request('/api/projects/' + encodeURIComponent(id) + '/tasks');
      let activeProjects = await request('/api/projects?filter=active');
      function drawTasks() {
        tasksList.replaceChildren();
        const visible = tasks.filter(task =>
          (filter.value === 'Deleted' ? Boolean(task.deleted) : !task.deleted && (filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed))) &&
          (priorityFilter.value === 'All' || task.priority === priorityFilter.value) &&
          (!appliedFrom && !appliedThrough || Boolean(task.dueDate)) &&
          (!appliedFrom || task.dueDate >= appliedFrom) &&
          (!appliedThrough || task.dueDate <= appliedThrough)
          && normalizeSearch(task.title).includes(normalizeSearch(appliedTaskSearch, true))
        );
        for (const task of visible) {
          const row = document.createElement('li');
          row.dataset.testid = 'task-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(task.completed);
          checkbox.disabled = Boolean(project.archived) || Boolean(task.deleted);
          checkbox.id = 'task-' + task.id;
          checkbox.setAttribute('aria-label', 'Complete ' + task.title);
          checkbox.addEventListener('change', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              drawTasks();
            } catch { checkbox.checked = !checkbox.checked; }
          });
          const title = document.createElement('label');
          title.htmlFor = checkbox.id;
          title.textContent = task.title;
          const renameInput = document.createElement('input');
          renameInput.type = 'text';
          renameInput.value = task.title;
          renameInput.setAttribute('aria-label', 'New task title');
          renameInput.disabled = Boolean(project.archived) || Boolean(task.deleted);
          const renameButton = document.createElement('button');
          renameButton.type = 'button';
          renameButton.textContent = 'Rename task';
          renameButton.disabled = Boolean(project.archived) || Boolean(task.deleted);
          renameButton.addEventListener('click', async () => {
            const newTitle = renameInput.value.trim();
            if (!newTitle) {
              error.textContent = 'Task title is required';
              error.hidden = false;
              renameInput.focus();
              return;
            }
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              error.hidden = true;
              drawTasks();
            } catch {
              error.textContent = 'Unable to rename task';
              error.hidden = false;
            }
          });
          const priority = document.createElement('select');
          priority.setAttribute('aria-label', 'Task priority');
          for (const value of ['Low', 'Normal', 'High']) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            priority.append(option);
          }
          priority.value = task.priority || 'Normal';
          priority.disabled = Boolean(project.archived) || Boolean(task.deleted);
          priority.addEventListener('change', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              drawTasks();
            } catch { priority.value = task.priority || 'Normal'; }
          });
          const dueDate = document.createElement('input');
          dueDate.type = 'text';
          dueDate.setAttribute('aria-label', 'Task due date');
          dueDate.placeholder = 'YYYY-MM-DD';
          dueDate.value = task.dueDate || '';
          dueDate.disabled = Boolean(project.archived) || Boolean(task.deleted);
          const saveDueDate = document.createElement('button');
          saveDueDate.type = 'button';
          saveDueDate.textContent = 'Save due date';
          saveDueDate.disabled = Boolean(project.archived) || Boolean(task.deleted);
          saveDueDate.addEventListener('click', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate: dueDate.value }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              dueDate.value = updated.dueDate || '';
              error.hidden = true;
              drawTasks();
            } catch (failure) {
              if (dueDate.value.trim()) {
                error.textContent = 'Due date must be a valid YYYY-MM-DD date';
              } else {
                error.textContent = 'Unable to save due date';
              }
              error.hidden = false;
            }
          });
          const destination = document.createElement('select');
          destination.setAttribute('aria-label', 'Destination project');
          const eligible = activeProjects.filter(item => Number(item.id) !== Number(id));
          for (const item of eligible) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            destination.append(option);
          }
          const moveButton = document.createElement('button');
          moveButton.type = 'button';
          moveButton.textContent = 'Move task';
          destination.disabled = Boolean(project.archived) || Boolean(task.deleted) || eligible.length === 0;
          moveButton.disabled = Boolean(project.archived) || Boolean(task.deleted) || eligible.length === 0;
          moveButton.addEventListener('click', async () => {
            try {
              await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id) + '/move', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationProjectId: Number(destination.value) }) });
              tasks = tasks.filter(item => item.id !== task.id);
              drawTasks();
            } catch {
              error.textContent = 'Unable to move task';
              error.hidden = false;
            }
          });
          const notes = document.createElement('textarea');
          notes.setAttribute('aria-label', 'Task notes');
          notes.value = task.notes || '';
          notes.disabled = Boolean(project.archived) || Boolean(task.deleted);
          const saveNotes = document.createElement('button');
          saveNotes.type = 'button';
          saveNotes.textContent = 'Save notes';
          saveNotes.disabled = Boolean(project.archived) || Boolean(task.deleted);
          saveNotes.addEventListener('click', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes.value }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              error.hidden = true;
            } catch {
              error.textContent = 'Unable to save notes';
              error.hidden = false;
            }
          });
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
          deleteButton.disabled = Boolean(project.archived);
          deleteButton.addEventListener('click', async () => {
            try {
              const updated = await request('/api/projects/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(task.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: !task.deleted }) });
              tasks = tasks.map(item => item.id === updated.id ? updated : item);
              drawTasks();
            } catch { error.textContent = 'Unable to update task'; error.hidden = false; }
          });
          row.append(checkbox, title, renameInput, renameButton, priority, dueDate, saveDueDate, notes, saveNotes, destination, moveButton, deleteButton);
          tasksList.append(row);
        }
      }
      filter.addEventListener('change', drawTasks);
      priorityFilter.addEventListener('change', drawTasks);
      taskSearchButton.addEventListener('click', () => {
        appliedTaskSearch = taskSearchInput.value.trim();
        error.hidden = true;
        drawTasks();
      });
      function validDate(value) {
        const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
        if (!match) return false;
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1];
      }
      applyDueRange.addEventListener('click', () => {
        const from = dueFrom.value.trim();
        const through = dueThrough.value.trim();
        if ((from && !validDate(from)) || (through && !validDate(through))) {
          dueFrom.value = appliedFrom;
          dueThrough.value = appliedThrough;
          error.textContent = 'Due range must use valid YYYY-MM-DD dates';
          error.hidden = false;
          return;
        }
        if (from && through && from > through) {
          dueFrom.value = appliedFrom;
          dueThrough.value = appliedThrough;
          error.textContent = 'Due from must not be after Due through';
          error.hidden = false;
          return;
        }
        appliedFrom = from;
        appliedThrough = through;
        dueFrom.value = from;
        dueThrough.value = through;
        error.hidden = true;
        drawTasks();
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) {
          error.textContent = 'Task title is required';
          error.hidden = false;
          input.focus();
          return;
        }
        error.hidden = true;
        try {
          const created = await request('/api/projects/' + encodeURIComponent(id) + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
          tasks.push(created);
          input.value = '';
          drawTasks();
        } catch {
          error.textContent = 'Unable to create task';
          error.hidden = false;
        }
      });
      drawTasks();
      app.append(back, heading, download, archived, renameForm, defaultPriorityLabel, defaultPriority, form, error, filterLabel, filter, priorityFilterLabel, priorityFilter, taskSearchField, taskSearchButton, dueRange, tasksList);
    }

    if (location.pathname === '/directory') {
      renderDirectory().catch(() => { app.textContent = 'Unable to load task directory'; });
    } else if (escPath) {
      renderProject(escPath[1]).catch(() => { location.replace('/'); });
    } else {
      request('/api/projects').then(renderList).catch(() => {
        app.textContent = 'Unable to load projects';
      });
    }
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const filter = url.searchParams.get('filter') === 'archived' ? 1 : 0;
    sendJson(response, 200, listProjects.all(filter).map(project => ({ ...project, archived: Boolean(project.archived) })));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/projects/import') {
    try {
      const data = await readBody(request);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) { sendJson(response, 400, { error: 'Project name is required' }); return; }
      let doc;
      try { doc = JSON.parse(data.document); } catch { throw new Error('invalid'); }
      const priorities = ['Low', 'Normal', 'High'];
      const validDate = value => {
        if (value === '') return true;
        const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return false;
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      };
      const p = doc?.project;
      if (doc?.format !== 'workboard-project' || doc?.version !== 1 || !Number.isInteger(doc.version) || !p || typeof p !== 'object' || Array.isArray(p) || typeof p.name !== 'string' || !p.name.trim() || typeof p.archived !== 'boolean' || !priorities.includes(p.defaultPriority) || !Array.isArray(p.tasks) || !p.tasks.every(t => t && typeof t === 'object' && !Array.isArray(t) && typeof t.title === 'string' && t.title.trim() && typeof t.completed === 'boolean' && priorities.includes(t.priority) && validDate(t.dueDate) && typeof t.notes === 'string' && typeof t.deleted === 'boolean')) throw new Error('invalid');
      db.exec('BEGIN');
      try {
        const result = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)').run(name, p.archived ? 1 : 0, p.defaultPriority);
        const projectId = Number(result.lastInsertRowid);
        const insert = db.prepare('INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, deleted, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const position = db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)');
        p.tasks.forEach((task, index) => {
          const inserted = insert.run(projectId, task.title, task.completed ? 1 : 0, task.priority, task.dueDate || null, task.notes.replace(/\r\n?/g, '\n'), task.deleted ? 1 : 0, index);
          position.run(Number(inserted.lastInsertRowid), projectId, index);
        });
        db.exec('COMMIT');
        sendJson(response, 201, { id: projectId });
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch (error) {
      sendJson(response, 400, { error: error.message === 'Project name is required' ? error.message : 'Invalid project JSON' });
    }
    return;
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (request.method === 'GET' && exportMatch) {
    const projectId = Number(exportMatch[1]);
    const project = findProject.get(projectId);
    if (!project) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    const tasks = listTasks.all(projectId).map(task => ({
      title: task.title,
      completed: Boolean(task.completed),
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      notes: (task.notes || '').replace(/\r\n?/g, '\n'),
      deleted: Boolean(task.deleted)
    }));
    const document = {
      format: 'workboard-project',
      version: 1,
      project: {
        name: project.name,
        archived: Boolean(project.archived),
        defaultPriority: project.defaultPriority || 'Normal',
        tasks
      }
    };
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="workboard-project.json"',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(document));
    return;
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    sendJson(response, project ? 200 : 404, project ? { ...project, archived: Boolean(project.archived) } : { error: 'Project not found' });
    return;
  }
  if (request.method === 'PATCH' && projectMatch) {
    try {
      const projectId = Number(projectMatch[1]);
      const data = await readBody(request);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      if (project.archived) {
        sendJson(response, 409, { error: 'Archived projects cannot be renamed' });
        return;
      }
      renameProject.run(name, projectId);
      sendJson(response, 200, { ...project, name });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const defaultPriorityMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/default-priority$/);
  if (request.method === 'PATCH' && defaultPriorityMatch) {
    try {
      const projectId = Number(defaultPriorityMatch[1]);
      const data = await readBody(request);
      if (!['Low', 'Normal', 'High'].includes(data.priority)) {
        sendJson(response, 400, { error: 'Invalid default task priority' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) { sendJson(response, 404, { error: 'Project not found' }); return; }
      if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot change default task priority' }); return; }
      updateDefaultPriority.run(data.priority, projectId);
      sendJson(response, 200, { ...project, defaultPriority: data.priority, archived: false });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    try {
      const projectId = Number(archiveMatch[1]);
      const data = await readBody(request);
      if (typeof data.archived !== 'boolean') {
        sendJson(response, 400, { error: 'Archive state is required' });
        return;
      }
      const project = findProject.get(projectId);
      if (!project) {
        sendJson(response, 404, { error: 'Project not found' });
        return;
      }
      setArchived.run(data.archived ? 1 : 0, projectId);
      sendJson(response, 200, { ...project, archived: data.archived });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (request.method === 'PATCH' && moveMatch) {
    try {
      const sourceId = Number(moveMatch[1]);
      const taskId = Number(moveMatch[2]);
      const data = await readBody(request);
      const destinationId = Number(data.destinationProjectId);
      const source = findProject.get(sourceId);
      const destination = findProject.get(destinationId);
      const task = findTask.get(taskId, sourceId);
      if (!source || !destination || !task) { sendJson(response, 404, { error: 'Project or task not found' }); return; }
      if (source.archived || destination.archived || sourceId === destinationId || task.deleted) {
        sendJson(response, 409, { error: 'Tasks can only move between different active projects' });
        return;
      }
      let position = db.prepare('SELECT sort_order AS value FROM task_project_positions WHERE task_id = ? AND project_id = ?').get(taskId, destinationId)?.value;
      if (position === undefined) {
        position = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(destinationId).value;
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(taskId, destinationId, position);
      }
      db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?').run(destinationId, position, taskId, sourceId);
      sendJson(response, 200, { ...task, projectId: destinationId });
    } catch { sendJson(response, 400, { error: 'Invalid request' }); }
    return;
  }
  const tasksMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks(?:\/(\d+))?$/);
  if (tasksMatch) {
    const projectId = Number(tasksMatch[1]);
    if (!findProject.get(projectId)) {
      sendJson(response, 404, { error: 'Project not found' });
      return;
    }
    if (request.method === 'GET' && !tasksMatch[2]) {
      sendJson(response, 200, listTasks.all(projectId).map(task => ({ ...task, completed: Boolean(task.completed), deleted: Boolean(task.deleted) })));
      return;
    }
    if (request.method === 'POST' && !tasksMatch[2]) {
      try {
        const data = await readBody(request);
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) {
          sendJson(response, 400, { error: 'Task title is required' });
          return;
        }
        const project = findProject.get(projectId);
        if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot create tasks' }); return; }
        const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM task_project_positions WHERE project_id = ?').get(projectId).value;
        const result = db.prepare('INSERT INTO tasks (project_id, title, priority, sort_order) VALUES (?, ?, ?, ?)').run(projectId, title, project.defaultPriority || 'Normal', order);
        db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), projectId, order);
        sendJson(response, 201, { id: Number(result.lastInsertRowid), projectId, title, completed: false, priority: project.defaultPriority || 'Normal', dueDate: null, notes: '', deleted: false });
      } catch { sendJson(response, 400, { error: 'Invalid request' }); }
      return;
    }
    if (request.method === 'PATCH' && tasksMatch[2]) {
      try {
        const data = await readBody(request);
        const taskId = Number(tasksMatch[2]);
        const project = findProject.get(projectId);
        if (Object.hasOwn(data, 'deleted')) {
          if (project.archived) { sendJson(response, 409, { error: 'Archived projects cannot delete or restore tasks' }); return; }
          if (typeof data.deleted !== 'boolean') { sendJson(response, 400, { error: 'Task deletion state is required' }); return; }
          const existing = findTask.get(taskId, projectId);
          if (!existing) { sendJson(response, 404, { error: 'Task not found' }); return; }
          db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?').run(data.deleted ? 1 : 0, taskId, projectId);
          sendJson(response, 200, { ...existing, deleted: data.deleted, completed: Boolean(existing.completed) });
          return;
        }
        if (Object.hasOwn(data, 'notes')) {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change task notes' });
            return;
          }
          if (typeof data.notes !== 'string') {
            sendJson(response, 400, { error: 'Task notes must be text' });
            return;
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) { sendJson(response, 404, { error: 'Task not found' }); return; }
          updateNotes.run(data.notes, taskId, projectId);
          sendJson(response, 200, { ...existing, notes: data.notes, completed: Boolean(existing.completed) });
          return;
        }
        if (Object.hasOwn(data, 'dueDate')) {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change task due dates' });
            return;
          }
          const rawDate = typeof data.dueDate === 'string' ? data.dueDate.trim() : '';
          let canonicalDate = null;
          if (rawDate) {
            const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
              const year = Number(match[1]);
              const month = Number(match[2]);
              const day = Number(match[3]);
              const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
              const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
              if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]) canonicalDate = rawDate;
            }
            if (!canonicalDate) {
              sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
              return;
            }
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) { sendJson(response, 404, { error: 'Task not found' }); return; }
          updateDueDate.run(canonicalDate, taskId, projectId);
          sendJson(response, 200, { ...existing, dueDate: canonicalDate, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.title === 'string') {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot rename tasks' });
            return;
          }
          const title = data.title.trim();
          if (!title) {
            sendJson(response, 400, { error: 'Task title is required' });
            return;
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) {
            sendJson(response, 404, { error: 'Task not found' });
            return;
          }
          renameTask.run(title, taskId, projectId);
          sendJson(response, 200, { ...existing, title, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.priority === 'string') {
          if (project.archived) {
            sendJson(response, 409, { error: 'Archived projects cannot change task priority' });
            return;
          }
          if (!['Low', 'Normal', 'High'].includes(data.priority)) {
            sendJson(response, 400, { error: 'Invalid task priority' });
            return;
          }
          const existing = findTask.get(taskId, projectId);
          if (!existing) {
            sendJson(response, 404, { error: 'Task not found' });
            return;
          }
          updatePriority.run(data.priority, taskId, projectId);
          sendJson(response, 200, { ...existing, priority: data.priority, completed: Boolean(existing.completed) });
          return;
        }
        if (typeof data.completed !== 'boolean') {
          sendJson(response, 400, { error: 'Completion state is required' });
          return;
        }
        updateTask.run(data.completed ? 1 : 0, taskId, projectId);
        const task = findTask.get(taskId, projectId);
        if (!task) sendJson(response, 404, { error: 'Task not found' });
        else sendJson(response, 200, { ...task, completed: Boolean(task.completed) });
      } catch { sendJson(response, 400, { error: 'Invalid request' }); }
      return;
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    let body = '';
    try {
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error('Request too large');
      }
      const data = JSON.parse(body);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'Project name is required' });
        return;
      }
      const result = addProject.run(name);
      sendJson(response, 201, { id: Number(result.lastInsertRowid), name });
    } catch {
      sendJson(response, 400, { error: 'Invalid request' });
    }
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/directory' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request too large');
  }
  return JSON.parse(body);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on 0.0.0.0:${port}`);
});
