import { directoryOrders } from './directory-order.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #1c293c; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, textarea { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid #8a97aa; border-radius: 6px; }
    button { font: inherit; font-weight: 600; color: white; background: #2456b5; border: 0; border-radius: 6px; padding: 10px 16px; cursor: pointer; }
    button:hover { background: #1a428e; }
    button:disabled { background: #738098; cursor: not-allowed; }
    :focus-visible { outline: 3px solid #dd9c17; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { list-style: none; padding: 0; margin: 28px 0 0; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce2ec; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #9c2020; padding: 12px; background: #fff0f0; border-radius: 6px; }
    .empty { color: #596779; margin-top: 28px; }
    .project-rename, .task-create, .task-filter, .project-filter { margin-top: 24px; }
    select { font: inherit; padding: 8px; }
    .tasks { list-style: none; padding: 0; }
    .task { padding: 16px 0; border-top: 1px solid #dce2ec; }
    .task label { display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, filter = 'Active', error = '', query = '', importValues = {}) {
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="create project-import" method="post" action="/imports/projects">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json" rows="6">
${escapeHtml(importValues.json ?? '')}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <input id="imported-project-name" name="name" type="text" value="${escapeHtml(importValues.name ?? '')}">
      <button type="submit">Import project</button>
    </form>
    <form class="create project-search" method="get" action="/">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="query" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search projects</button>
    </form>
    <form class="project-filter" method="get" action="/">
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    ${projects.length ? `<ul class="projects">${projects.map((project) => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <form method="get" action="/projects/${escapeHtml(project.id)}">
          <button type="submit">Open project</button>
        </form>
        <form method="post" action="/projects/${escapeHtml(project.id)}/${project.archived ? 'restore' : 'archive'}">
          <input type="hidden" name="query" value="${escapeHtml(query)}">
          <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

export function renderProject(project, tasks = [], filter = 'All', error = '', priority = 'All', range = { from: '', through: '' }, destinations = [], query = '') {
  // Textarea content starts with a sacrificial newline: HTML strips the first
  // newline after the opening tag, preserving any leading newline in the notes.
  const moveDisabled = project.archived || destinations.length === 0;
  const projectPath = `/projects/${escapeHtml(project.id)}`;
  const rangeFields = `<input type="hidden" name="query" value="${escapeHtml(query)}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const filterFields = `<input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="priorityFilter" value="${escapeHtml(priority)}">
      ${rangeFields}`;
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="${projectPath}/export">
      <button type="submit">Download project</button>
    </form>
    <form method="get" action="/">
      <button type="submit">Projects</button>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create project-rename" method="post" action="${projectPath}/rename">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="task-default-priority" method="post" action="${projectPath}/default-priority">
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${['Low', 'Normal', 'High'].map((option) => `<option${project.default_task_priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form class="create task-create" method="post" action="${projectPath}/tasks">
      ${filterFields}
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="task-filter" method="get" action="${projectPath}">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', 'Low', 'Normal', 'High'].map((option) => `<option${priority === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="create task-search" method="post" action="${projectPath}/search">
      ${filterFields}
      <label for="task-search">Task search</label>
      <input id="task-search" name="searchQuery" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search tasks</button>
    </form>
    <form class="create due-range" method="post" action="${projectPath}/due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    ${tasks.length ? `<ul class="tasks">${tasks.map((task) => {
      const readOnly = project.archived || task.deleted;
      const taskMoveDisabled = moveDisabled || task.deleted;
      return `
      <li class="task" data-testid="task-row">
        <form method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}">
          ${filterFields}
          <label>
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${readOnly ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit"${readOnly ? ' disabled' : ''}>Save completion</button></noscript>
        </form>
        <form class="task-priority" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/priority">
          ${filterFields}
          <label for="task-priority-${escapeHtml(task.id)}">Task priority</label>
          <select id="task-priority-${escapeHtml(task.id)}" name="priority"${readOnly ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${['Low', 'Normal', 'High'].map((option) => `<option${task.priority === option ? ' selected' : ''}>${option}</option>`).join('')}
          </select>
          <noscript><button type="submit"${readOnly ? ' disabled' : ''}>Save priority</button></noscript>
        </form>
        <form class="create task-due-date" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/due-date">
          ${filterFields}
          <label for="task-due-date-${escapeHtml(task.id)}">Task due date</label>
          <input id="task-due-date-${escapeHtml(task.id)}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${readOnly ? ' disabled' : ''}>
          <button type="submit"${readOnly ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="create task-notes" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/notes">
          ${filterFields}
          <label for="task-notes-${escapeHtml(task.id)}">Task notes</label>
          <textarea id="task-notes-${escapeHtml(task.id)}" name="notes" rows="4"${readOnly ? ' disabled' : ''}>
${escapeHtml(task.notes)}</textarea>
          <button type="submit"${readOnly ? ' disabled' : ''}>Save notes</button>
        </form>
        <form class="create task-move" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/move">
          ${filterFields}
          <label for="destination-project-${escapeHtml(task.id)}">Destination project</label>
          <select id="destination-project-${escapeHtml(task.id)}" name="destination"${taskMoveDisabled ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${escapeHtml(destination.id)}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${taskMoveDisabled ? ' disabled' : ''}>Move task</button>
        </form>
        <form class="create task-rename" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/rename">
          ${filterFields}
          <label for="new-task-title-${escapeHtml(task.id)}">New task title</label>
          <input id="new-task-title-${escapeHtml(task.id)}" name="title" type="text" value="${escapeHtml(task.title)}"${readOnly ? ' disabled' : ''}>
          <button type="submit"${readOnly ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="create task-deletion" method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}/${task.deleted ? 'restore' : 'delete'}">
          ${filterFields}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </li>`;
    }).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

export function renderDirectory(tasks, { scope, filter, priority, range, query, order = 'Original' }, error = '') {
  const completedCount = tasks.filter((task) => task.completed).length;
  const canEdit = scope === 'Active' && filter !== 'Deleted';
  const canComplete = canEdit && tasks.some((task) => !task.completed);
  const canReopen = canEdit && tasks.some((task) => task.completed);
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  const selections = `<input type="hidden" name="order" value="${escapeHtml(order)}">
    <input type="hidden" name="scope" value="${escapeHtml(scope)}">
    <input type="hidden" name="filter" value="${escapeHtml(filter)}">
    <input type="hidden" name="priorityFilter" value="${escapeHtml(priority)}">`;
  const select = (label, id, name, options, selected) => `
    <label for="${id}">${label}</label>
    <select id="${id}" name="${name}" onchange="this.form.requestSubmit()">
      ${options.map((option) => `<option${option === selected ? ' selected' : ''}>${option}</option>`).join('')}
    </select>`;
  return page('Task directory', `
    <h1>Task directory</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="task-filter" method="get" action="/directory">
      ${rangeFields}
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      ${select('Project scope', 'project-scope', 'scope', ['Active', 'Archived'], scope)}
      ${select('Task filter', 'task-filter', 'filter', ['All', 'Open', 'Completed', 'Deleted'], filter)}
      ${select('Priority filter', 'priority-filter', 'priorityFilter', ['All', 'Low', 'Normal', 'High'], priority)}
      ${select('Directory order', 'directory-order', 'order', directoryOrders, order)}
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="create" method="get" action="/directory">
      ${selections}${rangeFields}
      <label for="directory-search">Directory search</label>
      <input id="directory-search" name="query" type="text" value="${escapeHtml(query)}">
      <button type="submit">Search directory</button>
    </form>
    <form class="create" method="post" action="/directory/due-range">
      ${selections}${rangeFields}
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="create" method="post" action="/directory/complete">
      ${selections}${rangeFields}
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <button type="submit"${canComplete ? '' : ' disabled'}>Complete visible tasks</button>
    </form>
    <form class="create" method="post" action="/directory/reopen">
      ${selections}${rangeFields}
      <input type="hidden" name="query" value="${escapeHtml(query)}">
      <button type="submit"${canReopen ? '' : ' disabled'}>Reopen visible tasks</button>
    </form>
    <p data-testid="directory-summary">${completedCount}/${tasks.length} completed</p>
    ${tasks.length ? `<ul class="tasks">${tasks.map((task) => `
      <li class="task" data-testid="directory-task-row">
        <div data-testid="directory-task-title">${escapeHtml(task.title)}</div>
        <div data-testid="directory-project-name">${escapeHtml(task.project_name)}</div>
        <div data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</div>
        <div data-testid="directory-task-priority">${escapeHtml(task.priority)}</div>
        <div data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</div>
        <div data-testid="directory-task-notes" style="white-space: pre-wrap; overflow-wrap: anywhere">${escapeHtml(task.notes)}</div>
        <form method="get" action="/projects/${escapeHtml(task.project_id)}">
          <button type="submit">Open project</button>
        </form>
      </li>`).join('')}</ul>` : '<p id="directory-empty" class="empty" role="status">No matching tasks</p>'}
    <script>
      // Native navigation keeps the old document visible during the request.
      // Hide its empty announcement until the next resolved page arrives.
      const emptyResult = document.getElementById('directory-empty');
      document.addEventListener('submit', (event) => {
        const path = new URL(event.target.action).pathname;
        if (emptyResult && (path === '/directory' || path.startsWith('/directory/'))) {
          emptyResult.hidden = true;
        }
      });
      window.addEventListener('pageshow', () => {
        if (emptyResult) emptyResult.hidden = false;
      });
    </script>
  `);
}

export function renderNotFound() {
  return page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>');
}
