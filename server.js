import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const dbPath = process.env.DB_PATH || './workboard.sqlite';
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High')),
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);
// Upgrade databases created by the earlier task checkpoints.
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((column) => column.name === 'archived')) {
  db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
}
if (!projectColumns.some((column) => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some((column) => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}
if (!taskColumns.some((column) => column.name === 'due_date')) {
  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
}
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE tasks SET sort_order = id');
}
if (!taskColumns.some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}
if (!taskColumns.some((column) => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}
// Keep each task's position in every project it has belonged to. The task's
// sort_order remains its position in its current project for existing queries.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_project_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );
  INSERT OR IGNORE INTO task_project_positions (task_id, project_id, sort_order)
    SELECT id, project_id, sort_order FROM tasks;
`);

const listProjects = db.prepare(`SELECT p.id, p.name, p.archived,
  SUM(CASE WHEN t.completed = 1 AND t.deleted = 0 THEN 1 ELSE 0 END) AS completedCount,
  SUM(CASE WHEN t.deleted = 0 THEN 1 ELSE 0 END) AS totalCount
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.archived = ? GROUP BY p.id ORDER BY p.id`);
const findProject = db.prepare('SELECT id, name, archived, default_priority AS defaultPriority FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const renameProject = db.prepare('UPDATE projects SET name = ? WHERE id = ?');
const setProjectArchived = db.prepare('UPDATE projects SET archived = ? WHERE id = ?');
const updateProjectDefaultPriority = db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?');
const listTasks = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE project_id = ? ORDER BY sort_order, id');
const createTask = db.prepare("INSERT INTO tasks (project_id, title, priority, sort_order) SELECT p.id, ?, p.default_priority, COALESCE((SELECT MAX(sort_order) + 1 FROM task_project_positions WHERE project_id = p.id), 0) FROM projects p WHERE p.id = ?");
const findTask = db.prepare('SELECT id, project_id AS projectId, title, completed, priority, due_date AS dueDate, notes, deleted FROM tasks WHERE id = ? AND project_id = ?');
const updateTask = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?');
const renameTask = db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?');
const updateTaskPriority = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?');
const updateTaskDueDate = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?');
const updateTaskNotes = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?');
const updateTaskDeleted = db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?');
const listActiveProjects = db.prepare('SELECT id, name FROM projects WHERE archived = 0 ORDER BY id');
const findTaskProjectPosition = db.prepare('SELECT sort_order AS sortOrder FROM task_project_positions WHERE task_id = ? AND project_id = ?');
const nextProjectPosition = db.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS sortOrder FROM task_project_positions WHERE project_id = ?');
const rememberTaskProjectPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)');
const moveTask = db.prepare('UPDATE tasks SET project_id = ?, sort_order = ? WHERE id = ? AND project_id = ?');

function isValidDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
    body { margin: 0; padding: 3rem 1rem; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem; background: white; border: 1px solid #d9e0e8; border-radius: 12px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: .75rem; align-items: end; flex-wrap: wrap; }
    label { display: grid; gap: .35rem; font-weight: 600; }
    input, textarea, button { font: inherit; padding: .65rem .8rem; border: 1px solid #aeb9c6; border-radius: 6px; }
    textarea { min-width: 14rem; min-height: 4rem; }
    button { cursor: pointer; background: #174ea6; color: white; border-color: #174ea6; }
    button.secondary { background: white; color: #174ea6; }
    ul { padding: 0; list-style: none; }
    [data-testid="project-row"] { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] { display: flex; align-items: center; gap: .7rem; padding: .7rem 0; border-bottom: 1px solid #e3e8ee; }
    [data-testid="task-row"] input { padding: 0; }
    [data-testid="directory-task-notes"] { white-space: pre-wrap; }
    .task-controls { margin-top: 1.5rem; }
    [role="alert"] { color: #a32626; margin: .75rem 0; }
  </style>
</head>
<body>
  <main id="app"><p>Loading…</p></main>
  <script>
    const app = document.querySelector('#app');
    const escId = (value) => encodeURIComponent(value);
    const normalizeSearchText = (value) => value
      .replace(/[ \t]+/g, ' ')
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    async function getProjects(archived = false) {
      const response = await fetch('/api/projects?archived=' + (archived ? '1' : '0'));
      if (!response.ok) throw new Error('Could not load projects');
      return response.json();
    }
    async function showList(selectedFilter = 'Active', appliedQuery = '') {
      const archived = selectedFilter === 'Archived';
      const projects = await getProjects(archived);
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Workboard';
      app.append(heading);
      const directoryButton = document.createElement('button');
      directoryButton.type = 'button';
      directoryButton.textContent = 'Task directory';
      directoryButton.addEventListener('click', () => { location.href = '/directory'; });
      app.append(directoryButton);
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Project name';
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Project name');
      label.append(input);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Create project';
      form.append(label, submit);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          alert.textContent = 'Project name is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        const response = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        if (!response.ok) return;
        await showList();
      });
      app.append(form, alert);
      const importForm = document.createElement('form');
      const jsonLabel = document.createElement('label');
      jsonLabel.textContent = 'Project JSON';
      const jsonInput = document.createElement('textarea');
      jsonInput.setAttribute('aria-label', 'Project JSON');
      jsonLabel.append(jsonInput);
      const importedNameLabel = document.createElement('label');
      importedNameLabel.textContent = 'Imported project name';
      const importedNameInput = document.createElement('input');
      importedNameInput.type = 'text';
      importedNameInput.setAttribute('aria-label', 'Imported project name');
      importedNameLabel.append(importedNameInput);
      const importButton = document.createElement('button');
      importButton.type = 'submit';
      importButton.textContent = 'Import project';
      importForm.append(jsonLabel, importedNameLabel, importButton);
      const importAlert = document.createElement('p');
      importAlert.setAttribute('role', 'alert');
      importAlert.hidden = true;
      importForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document: jsonInput.value, name: importedNameInput.value }) });
        if (response.ok) {
          const imported = await response.json();
          location.href = '/projects/' + escId(imported.id);
        } else {
          const result = await response.json();
          importAlert.textContent = result.error === 'Project name is required' ? result.error : 'Invalid project JSON';
          importAlert.hidden = false;
        }
      });
      app.append(importForm, importAlert);
      const searchForm = document.createElement('form');
      const searchLabel = document.createElement('label');
      searchLabel.textContent = 'Project search';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.setAttribute('aria-label', 'Project search');
      searchInput.value = appliedQuery;
      searchLabel.append(searchInput);
      const searchButton = document.createElement('button');
      searchButton.type = 'submit';
      searchButton.textContent = 'Search projects';
      searchForm.append(searchLabel, searchButton);
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        showList(selectedFilter, searchInput.value.trim());
      });
      app.append(searchForm);
      const searchNeedle = normalizeSearchText(appliedQuery.trim());
      const matchingProjects = projects.filter((project) => normalizeSearchText(project.name).includes(searchNeedle));
      const filterLabel = document.createElement('label');
      filterLabel.textContent = 'Project filter';
      const filter = document.createElement('select');
      filter.setAttribute('aria-label', 'Project filter');
      for (const value of ['Active', 'Archived']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        filter.append(option);
      }
      filter.value = selectedFilter;
      filter.addEventListener('change', () => showList(filter.value, appliedQuery));
      filterLabel.append(filter);
      app.append(filterLabel);
      const list = document.createElement('ul');
      for (const project of matchingProjects) {
        const row = document.createElement('li');
        row.dataset.testid = 'project-row';
        const name = document.createElement('span');
        name.textContent = project.name;
        const summary = document.createElement('span');
        summary.dataset.testid = 'project-summary';
        summary.textContent = project.completedCount + '/' + project.totalCount + ' completed';
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open project';
        open.addEventListener('click', () => { location.href = '/projects/' + escId(project.id); });
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.className = 'secondary';
        archive.textContent = archived ? 'Restore project' : 'Archive project';
        archive.addEventListener('click', async () => {
          const changed = await fetch('/api/projects/' + escId(project.id) + '/archive', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !archived })
          });
          if (changed.ok) await showList(selectedFilter, appliedQuery);
        });
        row.append(name, summary, open, archive);
        list.append(row);
      }
      app.append(list);
    }
    async function showDirectory() {
      const response = await fetch('/api/directory');
      if (!response.ok) throw new Error('Could not load task directory');
      const tasks = await response.json();
      app.replaceChildren();
      const heading = document.createElement('h1');
      heading.textContent = 'Task directory';
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(heading, back);

      const addSelect = (labelText, ariaLabel, values) => {
        const label = document.createElement('label');
        label.textContent = labelText;
        const select = document.createElement('select');
        select.setAttribute('aria-label', ariaLabel);
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.append(option);
        }
        label.append(select);
        app.append(label);
        return select;
      };
      const projectScope = addSelect('Project scope', 'Project scope', ['Active', 'Archived']);
      const taskFilter = addSelect('Task filter', 'Task filter', ['All', 'Open', 'Completed', 'Deleted']);
      const priorityFilter = addSelect('Priority filter', 'Priority filter', ['All', 'Low', 'Normal', 'High']);
      const rangeForm = document.createElement('form');
      const makeDateInput = (labelText) => {
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'YYYY-MM-DD';
        input.setAttribute('aria-label', labelText);
        label.append(input);
        rangeForm.append(label);
        return input;
      };
      const dueFrom = makeDateInput('Due from');
      const dueThrough = makeDateInput('Due through');
      const applyRange = document.createElement('button');
      applyRange.type = 'submit';
      applyRange.textContent = 'Apply due range';
      rangeForm.append(applyRange);
      const rangeAlert = document.createElement('p');
      rangeAlert.setAttribute('role', 'alert');
      rangeAlert.hidden = true;
      app.append(rangeForm, rangeAlert);
      const searchForm = document.createElement('form');
      const searchLabel = document.createElement('label');
      searchLabel.textContent = 'Directory search';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.setAttribute('aria-label', 'Directory search');
      searchLabel.append(searchInput);
      const searchButton = document.createElement('button');
      searchButton.type = 'submit';
      searchButton.textContent = 'Search directory';
      searchForm.append(searchLabel, searchButton);
      app.append(searchForm);
      const list = document.createElement('ul');
      app.append(list);
      let appliedFrom = '';
      let appliedThrough = '';
      let appliedQuery = '';
      const validDate = (value) => {
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split('-').map(Number);
        if (year < 1 || month < 1 || month > 12 || day < 1) return false;
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      };
      rangeForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const from = dueFrom.value.trim();
        const through = dueThrough.value.trim();
        if ((from && !validDate(from)) || (through && !validDate(through))) {
          rangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
          rangeAlert.hidden = false;
          return;
        }
        if (from && through && from > through) {
          rangeAlert.textContent = 'Due from must not be after Due through';
          rangeAlert.hidden = false;
          return;
        }
        appliedFrom = from;
        appliedThrough = through;
        rangeAlert.hidden = true;
        render();
      });
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        appliedQuery = searchInput.value.trim();
        render();
      });
      const normalize = (value) => value.replace(/[ \\t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      function render() {
        list.replaceChildren();
        for (const task of tasks) {
          if (task.archived !== (projectScope.value === 'Archived')) continue;
          if (taskFilter.value === 'Deleted' ? !task.deleted : task.deleted) continue;
          if (taskFilter.value === 'Open' && task.completed) continue;
          if (taskFilter.value === 'Completed' && !task.completed) continue;
          if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
          if (!normalize(task.title).includes(normalize(appliedQuery))) continue;
          if ((appliedFrom || appliedThrough) && !task.dueDate) continue;
          if (appliedFrom && task.dueDate < appliedFrom) continue;
          if (appliedThrough && task.dueDate > appliedThrough) continue;
          const row = document.createElement('li');
          row.dataset.testid = 'directory-task-row';
          const title = document.createElement('span');
          title.dataset.testid = 'directory-task-title';
          title.textContent = task.title;
          const owner = document.createElement('span');
          owner.dataset.testid = 'directory-project-name';
          owner.textContent = task.projectName;
          const completion = document.createElement('span');
          completion.dataset.testid = 'directory-task-completion';
          completion.textContent = task.completed ? 'Completed' : 'Open';
          const priority = document.createElement('span');
          priority.dataset.testid = 'directory-task-priority';
          priority.textContent = task.priority || 'Normal';
          const dueDate = document.createElement('span');
          dueDate.dataset.testid = 'directory-task-due-date';
          dueDate.textContent = task.dueDate || '';
          const notes = document.createElement('span');
          notes.dataset.testid = 'directory-task-notes';
          notes.textContent = task.notes || '';
          const open = document.createElement('button');
          open.type = 'button';
          open.textContent = 'Open project';
          open.addEventListener('click', () => { location.href = '/projects/' + escId(task.projectId); });
          row.append(title, owner, completion, priority, dueDate, notes, open);
          list.append(row);
        }
      }
      projectScope.addEventListener('change', render);
      taskFilter.addEventListener('change', render);
      priorityFilter.addEventListener('change', render);
      render();
    }
    async function showProject(id, savedView = null) {
      const response = await fetch('/api/projects/' + escId(id));
      app.replaceChildren();
      if (!response.ok) {
        const heading = document.createElement('h1');
        heading.textContent = 'Project not found';
        app.append(heading);
      } else {
        const project = await response.json();
        const heading = document.createElement('h1');
        heading.textContent = project.name;
        const back = document.createElement('button');
        back.textContent = 'Projects';
        back.addEventListener('click', () => { location.href = '/'; });
        const download = document.createElement('button');
        download.type = 'button';
        download.textContent = 'Download project';
        download.addEventListener('click', () => {
          const link = document.createElement('a');
          link.href = '/api/projects/' + escId(id) + '/export';
          link.download = 'workboard-project.json';
          document.body.append(link);
          link.click();
          link.remove();
        });
        app.append(heading, back, download);
        const renameForm = document.createElement('form');
        const renameLabel = document.createElement('label');
        renameLabel.textContent = 'New project name';
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.setAttribute('aria-label', 'New project name');
        renameInput.disabled = Boolean(project.archived);
        renameLabel.append(renameInput);
        const renameButton = document.createElement('button');
        renameButton.type = 'submit';
        renameButton.textContent = 'Rename project';
        renameButton.disabled = Boolean(project.archived);
        renameForm.append(renameLabel, renameButton);
        const renameAlert = document.createElement('p');
        renameAlert.setAttribute('role', 'alert');
        renameAlert.hidden = true;
        renameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const name = renameInput.value.trim();
          if (!name) {
            renameAlert.textContent = 'Project name is required';
            renameAlert.hidden = false;
            renameInput.focus();
            return;
          }
          const renamed = await fetch('/api/projects/' + escId(id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
          });
          if (renamed.ok) await showProject(id, currentView());
        });
        app.append(renameForm, renameAlert);
        const defaultPriorityLabel = document.createElement('label');
        defaultPriorityLabel.textContent = 'Default task priority';
        const defaultPriority = document.createElement('select');
        defaultPriority.setAttribute('aria-label', 'Default task priority');
        for (const value of ['Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          defaultPriority.append(option);
        }
        defaultPriority.value = project.defaultPriority || 'Normal';
        defaultPriority.disabled = Boolean(project.archived);
        defaultPriority.addEventListener('change', async () => {
          const saved = await fetch('/api/projects/' + escId(id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultPriority: defaultPriority.value })
          });
          if (!saved.ok) defaultPriority.value = project.defaultPriority || 'Normal';
          else project.defaultPriority = defaultPriority.value;
        });
        defaultPriorityLabel.append(defaultPriority);
        app.append(defaultPriorityLabel);
        const archivedNotice = document.createElement('p');
        if (project.archived) {
          archivedNotice.textContent = 'Archived project';
          app.append(archivedNotice);
        }
        const form = document.createElement('form');
        form.className = 'task-controls';
        const label = document.createElement('label');
        label.textContent = 'Task title';
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('aria-label', 'Task title');
        label.append(input);
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Create task';
        submit.disabled = Boolean(project.archived);
        form.append(label, submit);
        const alert = document.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.hidden = true;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const title = input.value.trim();
          if (!title) {
            alert.textContent = 'Task title is required';
            alert.hidden = false;
            input.focus();
            return;
          }
          const created = await fetch('/api/projects/' + escId(id) + '/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (created.ok) await showProject(id, currentView());
        });
        app.append(form, alert);
        const filterLabel = document.createElement('label');
        filterLabel.textContent = 'Task filter';
        const filter = document.createElement('select');
        filter.setAttribute('aria-label', 'Task filter');
        for (const value of ['All', 'Open', 'Completed', 'Deleted']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          filter.append(option);
        }
        filterLabel.append(filter);
        app.append(filterLabel);
        const priorityFilterLabel = document.createElement('label');
        priorityFilterLabel.textContent = 'Priority filter';
        const priorityFilter = document.createElement('select');
        priorityFilter.setAttribute('aria-label', 'Priority filter');
        for (const value of ['All', 'Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          priorityFilter.append(option);
        }
        priorityFilterLabel.append(priorityFilter);
        app.append(priorityFilterLabel);
        const dueRangeForm = document.createElement('form');
        const dueFromLabel = document.createElement('label');
        dueFromLabel.textContent = 'Due from';
        const dueFrom = document.createElement('input');
        dueFrom.type = 'text';
        dueFrom.setAttribute('aria-label', 'Due from');
        dueFrom.placeholder = 'YYYY-MM-DD';
        dueFromLabel.append(dueFrom);
        const dueThroughLabel = document.createElement('label');
        dueThroughLabel.textContent = 'Due through';
        const dueThrough = document.createElement('input');
        dueThrough.type = 'text';
        dueThrough.setAttribute('aria-label', 'Due through');
        dueThrough.placeholder = 'YYYY-MM-DD';
        dueThroughLabel.append(dueThrough);
        const applyDueRange = document.createElement('button');
        applyDueRange.type = 'submit';
        applyDueRange.textContent = 'Apply due range';
        dueRangeForm.append(dueFromLabel, dueThroughLabel, applyDueRange);
        const rangeAlert = document.createElement('p');
        rangeAlert.setAttribute('role', 'alert');
        rangeAlert.hidden = true;
        app.append(dueRangeForm, rangeAlert);
        const taskSearchForm = document.createElement('form');
        const taskSearchLabel = document.createElement('label');
        taskSearchLabel.textContent = 'Task search';
        const taskSearchInput = document.createElement('input');
        taskSearchInput.type = 'text';
        taskSearchInput.setAttribute('aria-label', 'Task search');
        taskSearchInput.value = savedView?.taskSearchInput || '';
        taskSearchLabel.append(taskSearchInput);
        const taskSearchButton = document.createElement('button');
        taskSearchButton.type = 'submit';
        taskSearchButton.textContent = 'Search tasks';
        taskSearchForm.append(taskSearchLabel, taskSearchButton);
        app.append(taskSearchForm);
        let appliedTaskQuery = savedView?.appliedTaskQuery || '';
        taskSearchForm.addEventListener('submit', (event) => {
          event.preventDefault();
          appliedTaskQuery = taskSearchInput.value.trim();
          if (savedView) Object.assign(savedView, currentView());
          renderTasks();
        });
        let appliedFrom = savedView?.appliedFrom || '';
        let appliedThrough = savedView?.appliedThrough || '';
        dueFrom.value = savedView?.dueFrom || '';
        dueThrough.value = savedView?.dueThrough || '';
        filter.value = savedView?.taskFilter || 'All';
        priorityFilter.value = savedView?.priorityFilter || 'All';
        function currentView() {
          return { taskFilter: filter.value, priorityFilter: priorityFilter.value,
            dueFrom: dueFrom.value, dueThrough: dueThrough.value, appliedFrom, appliedThrough,
            taskSearchInput: taskSearchInput.value, appliedTaskQuery };
        }
        dueRangeForm.addEventListener('submit', (event) => {
          event.preventDefault();
          const from = dueFrom.value.trim();
          const through = dueThrough.value.trim();
          const validDate = (value) => {
            if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
            const [year, month, day] = value.split('-').map(Number);
            if (year < 1 || month < 1 || month > 12 || day < 1) return false;
            const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
            return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
          };
          if ((from && !validDate(from)) || (through && !validDate(through))) {
            rangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
            rangeAlert.hidden = false;
            return;
          }
          if (from && through && from > through) {
            rangeAlert.textContent = 'Due from must not be after Due through';
            rangeAlert.hidden = false;
            return;
          }
          appliedFrom = from;
          appliedThrough = through;
          rangeAlert.hidden = true;
          renderTasks();
        });
        const tasksResponse = await fetch('/api/projects/' + escId(id) + '/tasks');
        const tasks = await tasksResponse.json();
        const activeProjects = await getProjects(false);
        const list = document.createElement('ul');
        function renderTasks() {
          list.replaceChildren();
          for (const task of tasks) {
            if (filter.value === 'Deleted' ? !task.deleted : task.deleted) continue;
            if (filter.value === 'Open' && task.completed) continue;
            if (filter.value === 'Completed' && !task.completed) continue;
            if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
            if (!normalizeSearchText(task.title).includes(normalizeSearchText(appliedTaskQuery))) continue;
            if ((appliedFrom || appliedThrough) && !task.dueDate) continue;
            if (appliedFrom && task.dueDate < appliedFrom) continue;
            if (appliedThrough && task.dueDate > appliedThrough) continue;
            const row = document.createElement('li');
            row.dataset.testid = 'task-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(task.completed);
            checkbox.disabled = Boolean(project.archived) || Boolean(task.deleted);
            checkbox.setAttribute('aria-label', 'Complete ' + task.title);
            checkbox.addEventListener('change', async () => {
              const updated = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
              });
              if (updated.ok) {
                task.completed = checkbox.checked ? 1 : 0;
                if (savedView) Object.assign(savedView, currentView());
                renderTasks();
              }
            });
            const title = document.createElement('span');
            title.textContent = task.title;
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
              const updated = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value })
              });
              if (updated.ok) {
                task.priority = priority.value;
                if (savedView) Object.assign(savedView, currentView());
                renderTasks();
              }
            });
            const renameInput = document.createElement('input');
            renameInput.type = 'text';
            renameInput.setAttribute('aria-label', 'New task title');
            renameInput.disabled = Boolean(project.archived) || Boolean(task.deleted);
            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.textContent = 'Rename task';
            renameButton.disabled = Boolean(project.archived) || Boolean(task.deleted);
            renameButton.addEventListener('click', async () => {
              const newTitle = renameInput.value.trim();
              if (!newTitle) {
                alert.textContent = 'Task title is required';
                alert.hidden = false;
                renameInput.focus();
                return;
              }
              const renamed = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
              });
              if (renamed.ok) {
                const updatedTask = await renamed.json();
                task.title = updatedTask.title;
                if (savedView) Object.assign(savedView, currentView());
                renderTasks();
              }
            });
            const dueDateInput = document.createElement('input');
            dueDateInput.type = 'text';
            dueDateInput.setAttribute('aria-label', 'Task due date');
            dueDateInput.placeholder = 'YYYY-MM-DD';
            dueDateInput.value = task.dueDate || '';
            dueDateInput.disabled = Boolean(project.archived) || Boolean(task.deleted);
            const saveDueDate = document.createElement('button');
            saveDueDate.type = 'button';
            saveDueDate.textContent = 'Save due date';
            saveDueDate.disabled = Boolean(project.archived) || Boolean(task.deleted);
            saveDueDate.addEventListener('click', async () => {
              const value = dueDateInput.value.trim();
              if (value && !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
                alert.textContent = 'Due date must be a valid YYYY-MM-DD date';
                alert.hidden = false;
                dueDateInput.focus();
                return;
              }
              const savedDate = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dueDate: value })
              });
              if (savedDate.ok) {
                const updatedTask = await savedDate.json();
                task.dueDate = updatedTask.dueDate;
                dueDateInput.value = task.dueDate || '';
                alert.hidden = true;
                renderTasks();
              } else {
                alert.textContent = 'Due date must be a valid YYYY-MM-DD date';
                alert.hidden = false;
              }
            });
            const destinations = activeProjects.filter((candidate) => String(candidate.id) !== String(id));
            const destination = document.createElement('select');
            destination.setAttribute('aria-label', 'Destination project');
            for (const candidate of destinations) {
              const option = document.createElement('option');
              option.value = candidate.id;
              option.textContent = candidate.name;
              destination.append(option);
            }
            const moveButton = document.createElement('button');
            moveButton.type = 'button';
            moveButton.textContent = 'Move task';
            destination.disabled = Boolean(project.archived) || Boolean(task.deleted) || destinations.length === 0;
            moveButton.disabled = Boolean(project.archived) || Boolean(task.deleted) || destinations.length === 0;
            moveButton.addEventListener('click', async () => {
              if (!destination.value) return;
              const moved = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id) + '/move', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destinationProjectId: Number(destination.value) })
              });
              if (moved.ok) {
                const index = tasks.findIndex((item) => item.id === task.id);
                if (index !== -1) tasks.splice(index, 1);
                if (savedView) Object.assign(savedView, currentView());
                renderTasks();
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
              const saved = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: notes.value })
              });
              if (saved.ok) {
                const updatedTask = await saved.json();
                task.notes = updatedTask.notes;
                notes.value = task.notes;
              }
            });
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
            deleteButton.disabled = Boolean(project.archived);
            deleteButton.addEventListener('click', async () => {
              const changed = await fetch('/api/projects/' + escId(id) + '/tasks/' + escId(task.id), {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted: !task.deleted })
              });
              if (changed.ok) { task.deleted = task.deleted ? 0 : 1; renderTasks(); }
            });
            row.append(deleteButton, checkbox, title, renameInput, renameButton, priority, dueDateInput, saveDueDate, notes, saveNotes, destination, moveButton);
            list.append(row);
          }
        }
        filter.addEventListener('change', renderTasks);
        priorityFilter.addEventListener('change', renderTasks);
        renderTasks();
        app.append(list);
      }
    }
    const match = location.pathname.match(/^\\/projects\\/([^/]+)\\/?$/);
    (match ? showProject(decodeURIComponent(match[1])) : location.pathname === '/directory' ? showDirectory() : showList()).catch(() => {
      app.textContent = 'Unable to load Workboard';
    });
  </script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/directory') {
    const rows = db.prepare(`SELECT t.id, t.project_id AS projectId, p.name AS projectName,
      p.archived, t.title, t.completed, t.priority, t.due_date AS dueDate, t.notes, t.deleted
      FROM projects p JOIN tasks t ON t.project_id = p.id
      ORDER BY p.id, t.sort_order, t.id`).all();
    return sendJson(response, 200, rows);
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, listProjects.all(url.searchParams.get('archived') === '1' ? 1 : 0));
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    const result = createProject.run(name);
    return sendJson(response, 201, findProject.get(result.lastInsertRowid));
  }
  if (request.method === 'POST' && url.pathname === '/api/import') {
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    let document;
    try { document = JSON.parse(body?.document); } catch { return sendJson(response, 400, { error: 'Invalid project JSON' }); }
    const priorities = ['Low', 'Normal', 'High'];
    const source = document?.project;
    const valid = document?.format === 'workboard-project' && document?.version === 1 &&
      Number.isInteger(document.version) && source && typeof source === 'object' && !Array.isArray(source) &&
      typeof source.name === 'string' && source.name.trim().length > 0 && typeof source.archived === 'boolean' &&
      priorities.includes(source.defaultPriority) && Array.isArray(source.tasks) && source.tasks.every((task) =>
        task && typeof task === 'object' && !Array.isArray(task) && typeof task.title === 'string' && task.title.trim().length > 0 &&
        typeof task.completed === 'boolean' && priorities.includes(task.priority) && typeof task.dueDate === 'string' &&
        (task.dueDate === '' || isValidDueDate(task.dueDate)) && typeof task.notes === 'string' && typeof task.deleted === 'boolean');
    if (!valid) return sendJson(response, 400, { error: 'Invalid project JSON' });

    let importedId;
    try {
      db.exec('BEGIN');
      const projectResult = db.prepare('INSERT INTO projects (name, archived, default_priority) VALUES (?, ?, ?)')
        .run(name, source.archived ? 1 : 0, source.defaultPriority);
      importedId = Number(projectResult.lastInsertRowid);
      const addTask = db.prepare(`INSERT INTO tasks
        (project_id, title, completed, priority, due_date, notes, deleted, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const addPosition = db.prepare('INSERT INTO task_project_positions (task_id, project_id, sort_order) VALUES (?, ?, ?)');
      source.tasks.forEach((task, index) => {
        const taskResult = addTask.run(importedId, task.title, task.completed ? 1 : 0, task.priority,
          task.dueDate || null, task.notes.replace(/\r\n?/g, '\n'), task.deleted ? 1 : 0, index);
        addPosition.run(Number(taskResult.lastInsertRowid), importedId, index);
      });
      db.exec('COMMIT');
    } catch {
      db.exec('ROLLBACK');
      return sendJson(response, 400, { error: 'Invalid project JSON' });
    }
    return sendJson(response, 201, findProject.get(importedId));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    const projectId = Number(projectMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived projects cannot be changed' });
    const body = await readJson(request);
    if (['Low', 'Normal', 'High'].includes(body?.defaultPriority)) {
      updateProjectDefaultPriority.run(body.defaultPriority, projectId);
      return sendJson(response, 200, findProject.get(projectId));
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return sendJson(response, 400, { error: 'Project name is required' });
    renameProject.run(name, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  if (request.method === 'GET' && projectMatch) {
    const project = findProject.get(Number(projectMatch[1]));
    return project ? sendJson(response, 200, project) : sendJson(response, 404, { error: 'Project not found' });
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/export$/);
  if (request.method === 'GET' && exportMatch) {
    const projectId = Number(exportMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const tasks = listTasks.all(projectId).map((task) => ({
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
      'Content-Disposition': 'attachment; filename="workboard-project.json"'
    });
    return response.end(JSON.stringify(document));
  }
  const archiveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/archive$/);
  if (request.method === 'PATCH' && archiveMatch) {
    const projectId = Number(archiveMatch[1]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    const body = await readJson(request);
    if (typeof body?.archived !== 'boolean') return sendJson(response, 400, { error: 'archived must be a boolean' });
    setProjectArchived.run(body.archived ? 1 : 0, projectId);
    return sendJson(response, 200, findProject.get(projectId));
  }
  const taskCollectionMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks$/);
  if (taskCollectionMatch) {
    const projectId = Number(taskCollectionMatch[1]);
    if (!findProject.get(projectId)) return sendJson(response, 404, { error: 'Project not found' });
    if (request.method === 'GET') return sendJson(response, 200, listTasks.all(projectId));
    if (request.method === 'POST') {
      if (findProject.get(projectId).archived) return sendJson(response, 409, { error: 'Archived projects cannot accept tasks' });
      const body = await readJson(request);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      const result = createTask.run(title, projectId);
      const created = findTask.get(result.lastInsertRowid, projectId);
      // New tasks establish their initial position in their owning project.
      rememberTaskProjectPosition.run(created.id, projectId, db.prepare('SELECT sort_order FROM tasks WHERE id = ?').get(created.id).sort_order);
      return sendJson(response, 201, findTask.get(result.lastInsertRowid, projectId));
    }
  }
  const taskMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)$/);
  const moveMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/tasks\/(\d+)\/move$/);
  if (request.method === 'POST' && moveMatch) {
    const projectId = Number(moveMatch[1]);
    const taskId = Number(moveMatch[2]);
    const source = findProject.get(projectId);
    if (!source) return sendJson(response, 404, { error: 'Project not found' });
    if (source.archived) return sendJson(response, 409, { error: 'Archived projects cannot move tasks' });
    const body = await readJson(request);
    const destinationId = Number(body?.destinationProjectId);
    const destination = findProject.get(destinationId);
    if (!destination || destination.archived || destinationId === projectId) {
      return sendJson(response, 400, { error: 'Destination must be a different active project' });
    }
    const task = findTask.get(taskId, projectId);
    if (!task) return sendJson(response, 404, { error: 'Task not found' });
    let destinationPosition = findTaskProjectPosition.get(taskId, destinationId)?.sortOrder;
    if (destinationPosition === undefined) {
      destinationPosition = nextProjectPosition.get(destinationId).sortOrder;
      rememberTaskProjectPosition.run(taskId, destinationId, destinationPosition);
    }
    moveTask.run(destinationId, destinationPosition, taskId, projectId);
    return sendJson(response, 200, findTask.get(taskId, destinationId));
  }
  if (request.method === 'PATCH' && taskMatch) {
    const projectId = Number(taskMatch[1]);
    const taskId = Number(taskMatch[2]);
    const project = findProject.get(projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.archived) return sendJson(response, 409, { error: 'Archived project tasks cannot be changed' });
    const body = await readJson(request);
    if (typeof body?.deleted === 'boolean') {
      updateTaskDeleted.run(body.deleted ? 1 : 0, taskId, projectId);
    } else if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) return sendJson(response, 400, { error: 'Task title is required' });
      renameTask.run(title, taskId, projectId);
    } else if (typeof body?.completed === 'boolean') {
      updateTask.run(body.completed ? 1 : 0, taskId, projectId);
    } else if (Object.hasOwn(body || {}, 'dueDate')) {
      const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
      if (dueDate && !isValidDueDate(dueDate)) return sendJson(response, 400, { error: 'Due date must be a valid YYYY-MM-DD date' });
      updateTaskDueDate.run(dueDate || null, taskId, projectId);
    } else if (typeof body?.notes === 'string') {
      updateTaskNotes.run(body.notes, taskId, projectId);
    } else if (['Low', 'Normal', 'High'].includes(body?.priority)) {
      updateTaskPriority.run(body.priority, taskId, projectId);
    } else {
      return sendJson(response, 400, { error: 'A task title, completion state, or valid priority is required' });
    }
    const task = findTask.get(taskId, projectId);
    return task ? sendJson(response, 200, task) : sendJson(response, 404, { error: 'Task not found' });
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/directory' || /^\/projects\/\d+\/?$/.test(url.pathname))) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0');
