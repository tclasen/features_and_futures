import { TASK_PRIORITIES } from './task-priorities.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function textareaContent(value) {
  // HTML parsing discards one initial newline inside a textarea. Supply that
  // newline explicitly so a saved leading newline remains part of the value.
  return `\n${escapeHtml(value)}`;
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/forms.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '', filter = 'Active', search = '', importFields = {}) {
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form action="/projects/import" method="post" class="project-import">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" name="json" rows="6">${textareaContent(importFields.json || '')}</textarea>
      <label for="imported-project-name">Imported project name</label>
      <input id="imported-project-name" name="importedName" type="text" value="${escapeHtml(importFields.name || '')}" autocomplete="off">
      <button type="submit">Import project</button>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/" method="get" class="project-filter" data-auto-submit>
      <input type="hidden" name="search" value="${escapeHtml(search)}">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter">
        ${['Active', 'Archived'].map((option) =>
          `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="/" method="get" class="project-search">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="project-search">Project search</label>
      <div class="form-controls">
        <input id="project-search" name="search" type="text" value="${escapeHtml(search)}" autocomplete="off">
        <button type="submit">Search projects</button>
      </div>
    </form>
    <section aria-label="Projects" class="project-list">
      ${projects.length ? projects.map((project) => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit">Open project</button>
          </form>
          <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="hidden" name="search" value="${escapeHtml(search)}">
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>`).join('') : '<p class="empty">Your projects will appear here.</p>'}
    </section>`);
}

export function projectPage(project, tasks = [], filter = 'All', error = '', priorityFilter = 'All', dueRange = {}, destinations = []) {
  const projectPath = `/projects/${project.id}`;
  const moveDisabled = project.archived || !destinations.length;
  const { dueFrom = '', dueThrough = '', search = '' } = dueRange;
  const searchField = `<input type="hidden" name="search" value="${escapeHtml(search)}">`;
  const rangeFields = `
    <input type="hidden" name="dueFrom" value="${escapeHtml(dueFrom)}">
    <input type="hidden" name="dueThrough" value="${escapeHtml(dueThrough)}">`;
  const otherFilterFields = `
    <input type="hidden" name="filter" value="${escapeHtml(filter)}">
    <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
    ${rangeFields}`;
  const filterFields = `${otherFilterFields}${searchField}`;
  return page(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="${projectPath}/download" method="get">
      ${filterFields}
      <button type="submit">Download project</button>
    </form>
    <form action="${projectPath}/rename" method="post">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="${projectPath}/default-priority" method="post" data-auto-submit>
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}>
        ${TASK_PRIORITIES.map((priority) =>
          `<option${priority === project.default_task_priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form action="${projectPath}/tasks" method="post">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="${projectPath}" method="get" class="task-filter" data-auto-submit>
      ${rangeFields}
      ${searchField}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${['All', 'Open', 'Completed', 'Deleted'].map((option) =>
          `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter">
        ${['All', ...TASK_PRIORITIES].map((option) =>
          `<option${option === priorityFilter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <form action="${projectPath}/due-range" method="post" class="due-range">
      ${filterFields}
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(dueFrom)}" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(dueThrough)}" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form action="${projectPath}" method="get" class="task-search">
      ${otherFilterFields}
      <label for="task-search">Task search</label>
      <div class="form-controls">
        <input id="task-search" name="search" type="text" value="${escapeHtml(search)}" autocomplete="off">
        <button type="submit">Search tasks</button>
      </div>
    </form>
    <section aria-label="Tasks" class="task-list">
      ${tasks.length ? tasks.map((task) => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form action="${projectPath}/tasks/${task.id}/completion" method="post" data-auto-submit>
            ${filterFields}
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived || task.deleted ? ' disabled' : ''}>
          </form>
          <form action="${projectPath}/tasks/${task.id}/priority" method="post" data-auto-submit>
            ${filterFields}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived || task.deleted ? ' disabled' : ''}>
              ${TASK_PRIORITIES.map((priority) =>
                `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form action="${projectPath}/tasks/${task.id}/rename" method="post" class="task-rename">
            ${filterFields}
            <label for="new-task-title-${task.id}">New task title</label>
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived || task.deleted ? ' disabled' : ''}>
            <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Rename task</button>
          </form>
          <form action="${projectPath}/tasks/${task.id}/due-date" method="post" class="task-due-date">
            ${filterFields}
            <label for="task-due-date-${task.id}">Task due date</label>
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived || task.deleted ? ' disabled' : ''}>
            <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save due date</button>
          </form>
          <form action="${projectPath}/tasks/${task.id}/move" method="post" class="task-move">
            ${filterFields}
            <label for="destination-project-${task.id}">Destination project</label>
            <select id="destination-project-${task.id}" name="destination"${moveDisabled || task.deleted ? ' disabled' : ''}>
              ${destinations.map((destination) =>
                `<option value="${destination.id}">${escapeHtml(destination.name)}</option>`).join('')}
            </select>
            <button type="submit"${moveDisabled || task.deleted ? ' disabled' : ''}>Move task</button>
          </form>
          <form action="${projectPath}/tasks/${task.id}/notes" method="post" class="task-notes">
            ${filterFields}
            <label for="task-notes-${task.id}">Task notes</label>
            <textarea id="task-notes-${task.id}" name="notes" rows="4"${project.archived || task.deleted ? ' disabled' : ''}>${textareaContent(task.notes)}</textarea>
            <button type="submit"${project.archived || task.deleted ? ' disabled' : ''}>Save notes</button>
          </form>
          <form action="${projectPath}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}" method="post" class="task-deletion">
            ${filterFields}
            <button type="submit"${project.archived ? ' disabled' : ''}>${task.deleted ? 'Restore task' : 'Delete task'}</button>
          </form>
        </div>`).join('') : '<p class="empty">No tasks match these filters.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
