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

if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'default_priority')) {
  db.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Low', 'Normal', 'High'))");
}

if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
}

if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'due_date')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
}

if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'notes')) {
  db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}

if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deleted')) {
  db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
}

if (!db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position')) {
  db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = id');
}

// Keep positions even while a task belongs to another project. Seed legacy
// tasks from their current order without replacing any remembered positions.
db.exec(`CREATE TABLE IF NOT EXISTS task_positions (
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (task_id, project_id),
  UNIQUE (project_id, position)
);
INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
  SELECT id, project_id, position FROM tasks;`);

function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    action();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
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
input, textarea { padding: 10px; border: 1px solid #8b98a7; border-radius: 5px; font: inherit; width: min(100%, 400px); }
button { padding: 10px 16px; border: 0; border-radius: 5px; background: #235baf; color: white; font: inherit; cursor: pointer; }
select { padding: 10px; font: inherit; }
input[type=checkbox] { width: auto; }
.task label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
.task { padding: 16px 0; border-top: 1px solid #dfe5ed; }
.task-create { margin-top: 28px; margin-bottom: 24px; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #ebad32; outline-offset: 3px; }
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

// Normalize only for matching; never rewrite saved names or titles.
const searchKey = value => value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, char => char.toLowerCase());
const searchMatches = (value, query) => searchKey(value).includes(searchKey(query));

function projectList(res, error = '', filter = 'Active', query = '') {
  const projects = db.prepare(`SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
    COALESCE(SUM(t.completed), 0) AS completed FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted = 0 WHERE p.archived = ?
    GROUP BY p.id ORDER BY p.id`).all(filter === 'Archived' ? 1 : 0)
    .filter(project => searchMatches(project.name, query));
  sendHtml(res, 200, page('Projects', `<h1>Workboard</h1>
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form method="post" action="/projects">
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="search" value="${escape(query)}">
<label for="project-name">Project name</label>
<div class="create"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div>
</form>
<form method="get" action="/">
<input type="hidden" name="search" value="${escape(query)}">
<label for="project-filter">Project filter</label>
<select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
${['Active', 'Archived'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<form method="get" action="/">
<input type="hidden" name="filter" value="${filter}">
<label for="project-search">Project search</label>
<input id="project-search" name="search" type="text" value="${escape(query)}">
<button type="submit">Search projects</button>
</form>
<section class="projects" aria-label="Projects">${projects.map(project => `
<div class="project" data-testid="project-row"><span>${escape(project.name)}</span>
<span data-testid="project-summary">${project.completed}/${project.total} completed</span>
<form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
<form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}"><input type="hidden" name="filter" value="${filter}"><input type="hidden" name="search" value="${escape(query)}"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form></div>`).join('')}
${projects.length ? '' : '<p>No projects yet.</p>'}</section>`));
}

function taskFilter(value) {
  return ['All', 'Open', 'Completed', 'Deleted'].includes(value) ? value : 'All';
}

function priorityFilter(value) {
  return ['All', 'Low', 'Normal', 'High'].includes(value) ? value : 'All';
}

function dueRange(params) {
  return { from: (params.get('dueFrom') || '').trim(), through: (params.get('dueThrough') || '').trim(), search: (params.get('search') || '').trim() };
}

function rangeFields(range) {
  return `<input type="hidden" name="search" value="${escape(range.search || '')}"><input type="hidden" name="dueFrom" value="${escape(range.from)}"><input type="hidden" name="dueThrough" value="${escape(range.through)}">`;
}

function projectLocation(id, filter, priority, range) {
  const params = new URLSearchParams({ filter });
  if (priority !== 'All') params.set('priorityFilter', priority);
  if (range.from) params.set('dueFrom', range.from);
  if (range.through) params.set('dueThrough', range.through);
  if (range.search) params.set('search', range.search);
  return `/projects/${id}?${params}`;
}

function projectPage(res, project, filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }) {
  const destinations = db.prepare('SELECT id, name FROM projects WHERE archived = 0 AND id <> ? ORDER BY id').all(project.id);
  const moveDisabled = project.archived || !destinations.length;
  const tasks = db.prepare(`SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ?
    AND deleted = ${filter === 'Deleted' ? 1 : 0}
    ${filter === 'Open' || filter === 'Completed' ? 'AND completed = ?' : ''}
    ${priority === 'All' ? '' : 'AND priority = ?'}
    ${range.from || range.through ? "AND due_date <> ''" : ''}
    ${range.from ? 'AND due_date >= ?' : ''}
    ${range.through ? 'AND due_date <= ?' : ''} ORDER BY position, id`)
    .all(project.id, ...(['Open', 'Completed'].includes(filter) ? [filter === 'Completed' ? 1 : 0] : []),
      ...(priority === 'All' ? [] : [priority]), ...(range.from ? [range.from] : []),
      ...(range.through ? [range.through] : []))
    .filter(task => searchMatches(task.title, range.search || ''));
  sendHtml(res, 200, page(project.name, `<h1>${escape(project.name)}</h1>
<form method="get" action="/"><button type="submit">Projects</button></form>
${project.archived ? '<p>Archived project</p>' : ''}
${error ? `<p role="alert">${escape(error)}</p>` : ''}
<form class="task-create" method="post" action="/projects/${project.id}/rename">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="new-project-name">New project name</label>
<div class="create"><input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}><button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button></div>
</form>
<form method="post" action="/projects/${project.id}/default-priority">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="default-task-priority">Default task priority</label>
<select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
${['Low', 'Normal', 'High'].map(option => `<option${project.default_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<form class="task-create" method="post" action="/projects/${project.id}/tasks">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="task-title">Task title</label>
<div class="create"><input id="task-title" name="title" type="text"><button type="submit"${project.archived ? ' disabled' : ''}>Create task</button></div>
</form>
<form method="get" action="/projects/${project.id}">
${rangeFields(range)}
<label for="task-filter">Task filter</label>
<select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
${['All', 'Open', 'Completed', 'Deleted'].map(option => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
</select>
<label for="priority-filter">Priority filter</label>
<select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
${['All', 'Low', 'Normal', 'High'].map(option => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<form method="get" action="/projects/${project.id}">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<input type="hidden" name="applyRange" value="1">
<label for="due-from">Due from</label>
<input id="due-from" type="text" name="rangeFrom" value="${escape(range.from)}">
<label for="due-through">Due through</label>
<input id="due-through" type="text" name="rangeThrough" value="${escape(range.through)}">
<button type="submit">Apply due range</button>
</form>
<form method="get" action="/projects/${project.id}">
<input type="hidden" name="dueFrom" value="${escape(range.from)}">
<input type="hidden" name="dueThrough" value="${escape(range.through)}">
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="task-search">Task search</label>
<input id="task-search" name="search" type="text" value="${escape(range.search || '')}">
<button type="submit">Search tasks</button>
</form>
<section class="projects" aria-label="Tasks">${tasks.map(task => `
<div class="task" data-testid="task-row">
<form method="post" action="/projects/${project.id}/tasks/${task.id}">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label><input type="checkbox" name="completed" value="1" aria-label="${escape(`Complete ${task.title}`)}"${task.completed ? ' checked' : ''}${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escape(task.title)}</span></label>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="new-task-title-${task.id}">New task title</label>
<div class="create"><input id="new-task-title-${task.id}" name="title" type="text"${project.archived || task.deleted ? ' disabled' : ''}><button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button></div>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="task-priority-${task.id}">Task priority</label>
<select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''} onchange="this.form.requestSubmit()">
${['Low', 'Normal', 'High'].map(option => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
</select></form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="task-due-date-${task.id}">Task due date</label>
<div class="create"><input id="task-due-date-${task.id}" name="due_date" type="text" value="${escape(task.due_date)}"${project.archived || task.deleted ? ' disabled' : ''}><button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button></div>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="task-notes-${task.id}">Task notes</label>
<div class="create"><textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived || task.deleted ? ' disabled' : ''}>
${escape(task.notes).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')}</textarea><button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button></div>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/move">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<label for="destination-project-${task.id}">Destination project</label>
<select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
${destinations.map(destination => `<option value="${destination.id}">${escape(destination.name)}</option>`).join('')}
</select>
<button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
</form>
<form method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
${rangeFields(range)}
<input type="hidden" name="filter" value="${filter}">
<input type="hidden" name="priorityFilter" value="${priority}">
<button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
</form></div>`).join('')}
${tasks.length ? '' : '<p>No tasks to show.</p>'}</section>`));
}

async function formBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
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
      projectList(res, '', url.searchParams.get('filter') === 'Archived' ? 'Archived' : 'Active', (url.searchParams.get('search') || '').trim());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/projects') {
      const body = await formBody(req);
      const name = (body.get('name') || '').trim();
      if (!name) {
        projectList(res, 'Project name is required', body.get('filter') === 'Archived' ? 'Archived' : 'Active', (body.get('search') || '').trim());
        return;
      }
      db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      res.writeHead(303, { Location: '/?' + new URLSearchParams({ filter: body.get('filter') === 'Archived' ? 'Archived' : 'Active', search: (body.get('search') || '').trim() }) });
      res.end();
      return;
    }
    const renameMatch = /^\/projects\/(\d+)\/rename$/.exec(url.pathname);
    if (req.method === 'POST' && renameMatch) {
      const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?').get(renameMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(res, 403, page('Archived project', '<h1>Archived project</h1><p>Archived projects cannot be changed.</p>'));
          return;
        }
        const body = await formBody(req);
        const filter = taskFilter(body.get('filter'));
        const priority = priorityFilter(body.get('priorityFilter'));
        const name = (body.get('name') || '').trim();
        if (!name) {
          projectPage(res, project, filter, 'Project name is required', priority, dueRange(body));
          return;
        }
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, project.id);
        res.writeHead(303, { Location: projectLocation(project.id, filter, priority, dueRange(body)) });
        res.end();
        return;
      }
    }
    const defaultMatch = /^\/projects\/(\d+)\/default-priority$/.exec(url.pathname);
    if (req.method === 'POST' && defaultMatch) {
      const project = db.prepare('SELECT id, archived FROM projects WHERE id = ?').get(defaultMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(res, 403, page('Archived project', '<h1>Archived project</h1><p>Archived projects cannot be changed.</p>'));
          return;
        }
        const body = await formBody(req);
        const priority = body.get('priority');
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          sendHtml(res, 400, page('Invalid priority', '<p role="alert">Invalid task priority</p>'));
          return;
        }
        db.prepare('UPDATE projects SET default_priority = ? WHERE id = ?').run(priority, project.id);
        res.writeHead(303, { Location: projectLocation(project.id, taskFilter(body.get('filter')), priorityFilter(body.get('priorityFilter')), dueRange(body)) });
        res.end();
        return;
      }
    }
    const archiveMatch = /^\/projects\/(\d+)\/(archive|restore)$/.exec(url.pathname);
    if (req.method === 'POST' && archiveMatch) {
      const body = await formBody(req);
      const result = db.prepare('UPDATE projects SET archived = ? WHERE id = ?')
        .run(archiveMatch[2] === 'archive' ? 1 : 0, archiveMatch[1]);
      if (result.changes) {
        const filter = body.get('filter') === 'Archived' || (!body.has('filter') && archiveMatch[2] === 'restore') ? 'Archived' : 'Active';
        res.writeHead(303, { Location: '/?' + new URLSearchParams({ filter, search: (body.get('search') || '').trim() }) });
        res.end();
        return;
      }
    }
    const taskMatch = /^\/projects\/(\d+)\/tasks(?:\/(\d+)(\/(?:rename|priority|due-date|notes|move|delete|restore))?)?$/.exec(url.pathname);
    if (req.method === 'POST' && taskMatch) {
      const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?').get(taskMatch[1]);
      if (project) {
        if (project.archived) {
          sendHtml(res, 403, page('Archived project', '<h1>Archived project</h1><p>Archived projects cannot be changed.</p>'));
          return;
        }
        const body = await formBody(req);
        const filter = taskFilter(body.get('filter'));
        const selectedPriority = priorityFilter(body.get('priorityFilter'));
        if (taskMatch[2]) {
          const task = db.prepare('SELECT deleted FROM tasks WHERE id = ? AND project_id = ?').get(taskMatch[2], project.id);
          if (!task) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          if (task.deleted && !['/delete', '/restore'].includes(taskMatch[3])) {
            sendHtml(res, 403, page('Deleted task', '<h1>Deleted task</h1><p>Restore the task before editing or moving it.</p>'));
            return;
          }
        }
        if (taskMatch[3] === '/delete' || taskMatch[3] === '/restore') {
          db.prepare('UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ?')
            .run(taskMatch[3] === '/delete' ? 1 : 0, taskMatch[2], project.id);
        } else if (taskMatch[3] === '/move') {
          const destination = db.prepare('SELECT id FROM projects WHERE id = ? AND archived = 0 AND id <> ?')
            .get(body.get('destination') || '', project.id);
          if (!destination) {
            projectPage(res, project, filter, 'Choose an active destination project', selectedPriority, dueRange(body));
            return;
          }
          const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskMatch[2], project.id);
          if (!task) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          transaction(() => {
            db.prepare(`INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
              VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`)
              .run(task.id, destination.id, destination.id);
            db.prepare(`UPDATE tasks SET project_id = ?,
              position = (SELECT position FROM task_positions WHERE task_id = ? AND project_id = ?)
              WHERE id = ?`).run(destination.id, task.id, destination.id, task.id);
          });
        } else if (taskMatch[3] === '/notes') {
          const result = db.prepare('UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ?')
            .run(body.get('notes') || '', taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else if (taskMatch[3] === '/due-date') {
          const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskMatch[2], project.id);
          if (!task) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const dueDate = (body.get('due_date') || '').trim();
          if (dueDate && !validDueDate(dueDate)) {
            projectPage(res, project, filter, 'Due date must be a valid YYYY-MM-DD date', selectedPriority, dueRange(body));
            return;
          }
          db.prepare('UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?').run(dueDate, task.id, project.id);
        } else if (taskMatch[3] === '/priority') {
          const priority = body.get('priority');
          if (!['Low', 'Normal', 'High'].includes(priority)) {
            sendHtml(res, 400, page('Invalid priority', '<p role="alert">Invalid task priority</p>'));
            return;
          }
          const result = db.prepare('UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?')
            .run(priority, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else if (taskMatch[3] === '/rename') {
          const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskMatch[2], project.id);
          if (!task) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
          const title = (body.get('title') || '').trim();
          if (!title) {
            projectPage(res, project, filter, 'Task title is required', selectedPriority, dueRange(body));
            return;
          }
          db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?').run(title, task.id, project.id);
        } else if (taskMatch[2]) {
          const result = db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?')
            .run(body.get('completed') === '1' ? 1 : 0, taskMatch[2], project.id);
          if (!result.changes) {
            sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
            return;
          }
        } else {
          const title = (body.get('title') || '').trim();
          if (!title) {
            projectPage(res, project, filter, 'Task title is required', selectedPriority, dueRange(body));
            return;
          }
          transaction(() => {
            const result = db.prepare(`INSERT INTO tasks (project_id, title, priority, position)
              VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?))`)
              .run(project.id, title, project.default_priority, project.id);
            db.prepare(`INSERT INTO task_positions (task_id, project_id, position)
              SELECT id, project_id, position FROM tasks WHERE id = ?`).run(result.lastInsertRowid);
          });
        }
        res.writeHead(303, { Location: projectLocation(project.id, filter, selectedPriority, dueRange(body)) });
        res.end();
        return;
      }
    }
    const match = /^\/projects\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const project = db.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?').get(match[1]);
      if (project) {
        let range = dueRange(url.searchParams);
        let error = '';
        if (url.searchParams.get('applyRange') === '1') {
          const requested = {
            from: (url.searchParams.get('rangeFrom') || '').trim(),
            through: (url.searchParams.get('rangeThrough') || '').trim(),
            search: range.search
          };
          if ((requested.from && !validDueDate(requested.from)) || (requested.through && !validDueDate(requested.through))) {
            error = 'Due range must use valid YYYY-MM-DD dates';
          } else if (requested.from && requested.through && requested.from > requested.through) {
            error = 'Due from must not be after Due through';
          } else {
            res.writeHead(303, { Location: projectLocation(project.id, taskFilter(url.searchParams.get('filter')), priorityFilter(url.searchParams.get('priorityFilter')), requested) });
            res.end();
            return;
          }
        }
        projectPage(res, project, taskFilter(url.searchParams.get('filter')), error, priorityFilter(url.searchParams.get('priorityFilter')), range);
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
