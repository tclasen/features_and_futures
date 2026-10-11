import { TASK_PRIORITIES } from './task-priorities.js';

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
  <title>${escapeHtml(title)} · Workboard</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/forms.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '', filter = 'Active') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="/" method="get" class="project-filter" data-auto-submit>
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter">
        ${['Active', 'Archived'].map((option) =>
          `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
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
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>`).join('') : '<p class="empty">Your projects will appear here.</p>'}
    </section>`);
}

export function projectPage(project, tasks = [], filter = 'All', error = '', priorityFilter = 'All') {
  const projectPath = `/projects/${project.id}`;
  return page(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form action="${projectPath}/rename" method="post">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form action="${projectPath}/default-priority" method="post" data-auto-submit>
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}>
        ${TASK_PRIORITIES.map((priority) =>
          `<option${priority === project.default_task_priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
    </form>
    <form action="${projectPath}/tasks" method="post">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="${projectPath}" method="get" class="task-filter" data-auto-submit>
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${['All', 'Open', 'Completed'].map((option) =>
          `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter">
        ${['All', ...TASK_PRIORITIES].map((option) =>
          `<option${option === priorityFilter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks" class="task-list">
      ${tasks.length ? tasks.map((task) => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form action="${projectPath}/tasks/${task.id}/completion" method="post" data-auto-submit>
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
          </form>
          <form action="${projectPath}/tasks/${task.id}/priority" method="post" data-auto-submit>
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''}>
              ${TASK_PRIORITIES.map((priority) =>
                `<option${priority === task.priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
          </form>
          <form action="${projectPath}/tasks/${task.id}/rename" method="post" class="task-rename">
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
            <label for="new-task-title-${task.id}">New task title</label>
            <input id="new-task-title-${task.id}" name="title" type="text" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </form>
          <form action="${projectPath}/tasks/${task.id}/due-date" method="post" class="task-due-date">
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="hidden" name="priorityFilter" value="${escapeHtml(priorityFilter)}">
            <label for="task-due-date-${task.id}">Task due date</label>
            <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date)}" autocomplete="off"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
          </form>
        </div>`).join('') : '<p class="empty">No tasks match these filters.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
