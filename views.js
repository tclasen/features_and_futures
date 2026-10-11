import { TASK_PRIORITIES } from './task-priorities.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function escapeTextarea(value) {
  // Character references prevent HTML parsing from dropping a leading newline
  // or normalizing saved carriage returns.
  return escapeHtml(value).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #172334; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { overflow-wrap: anywhere; font-size: 36px; margin: 0 0 32px; }
    .create-form { background: white; padding: 24px; border: 1px solid #d7dfe8; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .form-controls { display: flex; gap: 12px; }
    input, textarea { min-width: 0; flex: 1; border: 1px solid #8996a8; border-radius: 6px; padding: 10px 12px; font: inherit; }
    textarea { width: 100%; margin-bottom: 12px; resize: vertical; }
    button { border: 1px solid #285ad1; border-radius: 6px; background: #285ad1; color: white; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #204bad; }
    button:disabled { background: #738096; border-color: #738096; cursor: default; }
    :focus-visible { outline: 3px solid #ad6c00; outline-offset: 3px; }
    [role="alert"] { color: #a21b25; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .task-create { margin-top: 24px; }
    .task-filter { margin-top: 24px; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #8996a8; border-radius: 6px; background: white; }
    .task-row { background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { flex: none; width: 20px; height: 20px; }
    .task-rename { margin-top: 16px; }
    .task-rename label { display: block; margin-bottom: 8px; }
    .task-rename input { width: 100%; margin-bottom: 12px; }
    .directory-field { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 520px) { main { margin-top: 32px; } .form-controls { flex-direction: column; } .project-row { padding: 16px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectListPage(projects, error = '', filter = 'Active', search = '', importForm = {}) {
  const searchInput = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="get" action="/directory"><button type="submit">Task directory</button></form>
    <form class="create-form task-create" method="post" action="/projects/import">
      ${searchInput}
      <input type="hidden" name="filter" value="${filter}">
      ${importForm.error ? `<p role="alert">${escapeHtml(importForm.error)}</p>` : ''}
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json" rows="8">${escapeTextarea(importForm.json ?? '')}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <div class="form-controls">
        <input id="imported-project-name" name="importedName" type="text" value="${escapeHtml(importForm.name ?? '')}">
        <button type="submit">Import project</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-search">Project search</label>
      <input id="project-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search projects</button>
    </form>
    <form class="create-form" method="post" action="/projects">
      ${searchInput}
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/">
      ${searchInput}
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${projects.map((project) => `<div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
        <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">${searchInput}<button type="submit">${project.archived ? 'Restore' : 'Archive'} project</button></form>
      </div>`).join('')}
    </div>`);
}

export function taskDirectoryPage(tasks, state, errors = {}) {
  const { scope, filter, priority, range, search } = state;
  const canEdit = scope === 'Active' && filter !== 'Deleted';
  const canComplete = canEdit && tasks.some((task) => !task.completed);
  const canReopen = canEdit && tasks.some((task) => task.completed);
  const hidden = (name, value) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  const selections = hidden('scope', scope) + hidden('filter', filter) + hidden('priorityFilter', priority);
  const boundaries = hidden('dueFrom', range.from) + hidden('dueThrough', range.through);
  const options = (values, selected) => values.map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  return page('Task directory', `<h1>Task directory</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="task-filter" method="get" action="/directory">
      ${boundaries}${hidden('search', search)}
      <label for="project-scope">Project scope</label>
      <select id="project-scope" name="scope" onchange="this.form.requestSubmit()">${options(['Active', 'Archived'], scope)}</select>
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">${options(['All', 'Open', 'Completed', 'Deleted'], filter)}</select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">${options(['All', ...TASK_PRIORITIES], priority)}</select>
    </form>
    <form class="task-filter" method="post" action="/directory/due-range">
      ${selections}${boundaries}${hidden('search', search)}
      ${errors.dueRange ? `<p role="alert">${escapeHtml(errors.dueRange)}</p>` : ''}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(errors.rangeFrom ?? range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(errors.rangeThrough ?? range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="task-filter" method="get" action="/directory">
      ${selections}${boundaries}
      <label for="directory-search">Directory search</label>
      <input id="directory-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search directory</button>
    </form>
    <form class="task-filter" method="post" action="/directory/complete">
      ${selections}${boundaries}${hidden('search', search)}
      <button type="submit"${canComplete ? '' : ' disabled'}>Complete visible tasks</button>
      <button type="submit" formaction="/directory/reopen"${canReopen ? '' : ' disabled'}>Reopen visible tasks</button>
    </form>
    ${tasks.length === 0 ? '<p role="status">No matching tasks</p>' : ''}
    <div class="projects">
      ${tasks.map((task) => `<div class="task-row" data-testid="directory-task-row">
        <div class="directory-field" data-testid="directory-task-title">${escapeHtml(task.title)}</div>
        <div class="directory-field" data-testid="directory-project-name">${escapeHtml(task.project_name)}</div>
        <div data-testid="directory-task-completion">${task.completed ? 'Completed' : 'Open'}</div>
        <div data-testid="directory-task-priority">${escapeHtml(task.priority)}</div>
        <div data-testid="directory-task-due-date">${escapeHtml(task.due_date)}</div>
        <div class="directory-field" data-testid="directory-task-notes">${escapeHtml(task.notes)}</div>
        <form method="get" action="/projects/${task.project_id}"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </div>`);
}

export function projectPage(project, tasks = [], filter = 'All', priorityFilter = 'All', errors = {}, range = { from: '', through: '' }, destinations = [], search = '') {
  const rangeAndSearchInputs = `<input type="hidden" name="search" value="${escapeHtml(search)}">
    <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">`;
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <button type="button" onclick="window.location.href='/projects/${project.id}/export'">Download project</button>
    <form class="create-form task-create" method="post" action="/projects/${project.id}/rename">
      ${errors.projectRename ? `<p role="alert">${escapeHtml(errors.projectRename)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeAndSearchInputs}
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form class="task-filter" method="post" action="/projects/${project.id}/default-priority">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeAndSearchInputs}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        ${TASK_PRIORITIES.map((priority) => `<option${project.default_task_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form class="create-form task-create" method="post" action="/projects/${project.id}/tasks">
      ${errors.taskCreation ? `<p role="alert">${escapeHtml(errors.taskCreation)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeAndSearchInputs}
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      ${rangeAndSearchInputs}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed', 'Deleted'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">
        ${['All', ...TASK_PRIORITIES].map((option) => `<option${priorityFilter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form class="task-filter" method="post" action="/projects/${project.id}/due-range">
      ${errors.dueRange ? `<p role="alert">${escapeHtml(errors.dueRange)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeAndSearchInputs}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(errors.rangeFrom ?? range.from)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(errors.rangeThrough ?? range.through)}">
      <button type="submit">Apply due range</button>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      <input type="hidden" name="dueFrom" value="${escapeHtml(range.from)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(range.through)}">
      <label for="task-search">Task search</label>
      <input id="task-search" name="search" type="text" value="${escapeHtml(search)}">
      <button type="submit">Search tasks</button>
    </form>
    <div class="projects">
      ${tasks.map((task) => {
        const readOnly = project.archived || task.deleted;
        return `<div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${readOnly ? ' disabled' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
        <form class="task-filter" method="post" action="/projects/${project.id}/tasks/${task.id}/priority">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label for="task-priority-${task.id}">Task priority</label>
          <select id="task-priority-${task.id}" name="priority"${readOnly ? ' disabled' : ''} onchange="this.form.requestSubmit()">
            ${TASK_PRIORITIES.map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
          </select>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
          ${errors.taskRename?.id === task.id ? `<p role="alert">${escapeHtml(errors.taskRename.message)}</p>` : ''}
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label for="new-task-title-${task.id}">New task title</label>
          <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(task.title)}"${readOnly ? ' disabled' : ''}>
          <button type="submit"${readOnly ? ' disabled' : ''}>Rename task</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/due-date">
          ${errors.taskDueDate?.id === task.id ? `<p role="alert">${escapeHtml(errors.taskDueDate.message)}</p>` : ''}
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label for="task-due-date-${task.id}">Task due date</label>
          <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}"${readOnly ? ' disabled' : ''}>
          <button type="submit"${readOnly ? ' disabled' : ''}>Save due date</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/notes">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label for="task-notes-${task.id}">Task notes</label>
          <textarea id="task-notes-${task.id}" name="notes" rows="4"${readOnly ? ' disabled' : ''}>${escapeTextarea(task.notes)}</textarea>
          <button type="submit"${readOnly ? ' disabled' : ''}>Save notes</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/move">
          ${errors.taskMove?.id === task.id ? `<p role="alert">${escapeHtml(errors.taskMove.message)}</p>` : ''}
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <label for="destination-project-${task.id}">Destination project</label>
          <select id="destination-project-${task.id}" name="destination"${readOnly || !destinations.length ? ' disabled' : ''}>
            ${destinations.map((destination) => `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
          </select>
          <button type="submit"${readOnly || !destinations.length ? ' disabled' : ''}>Move task</button>
        </form>
        <form class="task-rename" method="post" action="/projects/${project.id}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}">
          <input type="hidden" name="filter" value="${filter}">
          <input type="hidden" name="priorityFilter" value="${priorityFilter}">
          ${rangeAndSearchInputs}
          <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
        </form>
      </div>`;
      }).join('')}
    </div>`);
}
