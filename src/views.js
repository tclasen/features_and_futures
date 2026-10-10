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
  <script src="/app.js" defer></script>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '', submittedName = '', filter = 'Active') {
  return page('Projects', `
    <p class="eyebrow">YOUR WORK, ORGANIZED</p>
    <h1>Workboard</h1>
    <form class="create-form" action="/projects" method="post">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" value="${escapeHtml(submittedName)}">
        <button type="submit">Create project</button>
      </div>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="project-filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" data-submit-on-change>
        ${['Active', 'Archived'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <section aria-label="Projects" class="project-list">
      ${projects.length ? projects.map((project) => `
        <article class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
          <div class="project-actions">
            <form action="/projects/${project.id}" method="get">
              <button class="secondary" type="submit">Open project</button>
            </form>
            <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post">
              <button class="secondary" type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
            </form>
          </div>
        </article>`).join('') : `<p class="empty">${filter === 'Archived' ? 'No archived projects.' : 'No projects yet. Create a project to get started.'}</p>`}
    </section>`);
}

export function projectPage(project, tasks = [], {
  filter = 'All', priorityFilter = 'All', error = '', submittedTitle = '',
  renameState = {}, taskRenameState = {}, taskDueDateState = {},
  dueFrom = '', dueThrough = '', dueRangeState = {},
} = {}) {
  const rangeFields = `<input type="hidden" name="dueFrom" value="${escapeHtml(dueFrom)}">
      <input type="hidden" name="dueThrough" value="${escapeHtml(dueThrough)}">`;
  const selectionFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">
      ${rangeFields}`;
  return page(project.name, `
    <form action="/" method="get"><button class="secondary" type="submit">Projects</button></form>
    <p class="eyebrow detail-label">PROJECT</p>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="create-form rename-form" action="/projects/${project.id}/rename" method="post">
      ${selectionFields}
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(renameState.submittedName ?? project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
      ${renameState.error ? `<p class="alert" role="alert">${escapeHtml(renameState.error)}</p>` : ''}
    </form>
    <form class="create-form" action="/projects/${project.id}/default-task-priority" method="post">
      ${selectionFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''} data-submit-on-change>
        ${['Low', 'Normal', 'High'].map((priority) => `<option${project.default_task_priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
      </select>
      <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save default priority</button></noscript>
    </form>
    <form class="create-form" action="/projects/${project.id}/tasks" method="post">
      ${selectionFields}
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" value="${escapeHtml(submittedTitle)}">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      ${rangeFields}
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-submit-on-change>
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter" data-submit-on-change>
        ${['All', 'Low', 'Normal', 'High'].map((option) => `<option${priorityFilter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <form class="due-range-form" action="/projects/${project.id}" method="get">
      ${selectionFields}
      <input type="hidden" name="applyDueRange" value="1">
      <label for="due-from">Due from</label>
      <input id="due-from" name="rangeFrom" type="text" value="${escapeHtml(dueRangeState.from ?? dueFrom)}">
      <label for="due-through">Due through</label>
      <input id="due-through" name="rangeThrough" type="text" value="${escapeHtml(dueRangeState.through ?? dueThrough)}">
      <button type="submit">Apply due range</button>
      ${dueRangeState.error ? `<p class="alert" role="alert">${escapeHtml(dueRangeState.error)}</p>` : ''}
    </form>
    <section aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `
        <article class="task-row" data-testid="task-row">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
            ${selectionFields}
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-submit-on-change>
            <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save completion</button></noscript>
          </form>
          <form action="/projects/${project.id}/tasks/${task.id}/priority" method="post">
            ${selectionFields}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''} data-submit-on-change>
              ${['Low', 'Normal', 'High'].map((priority) => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
            <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save priority</button></noscript>
          </form>
          <form class="task-rename-form" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
            ${selectionFields}
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="form-controls">
              <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(taskRenameState.taskId === task.id ? taskRenameState.submittedTitle : task.title)}"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
            ${taskRenameState.taskId === task.id && taskRenameState.error ? `<p class="alert" role="alert">${escapeHtml(taskRenameState.error)}</p>` : ''}
          </form>
          <form class="task-due-date-form" action="/projects/${project.id}/tasks/${task.id}/due-date" method="post">
            ${selectionFields}
            <label for="task-due-date-${task.id}">Task due date</label>
            <div class="form-controls">
              <input id="task-due-date-${task.id}" name="dueDate" type="text" value="${escapeHtml(task.due_date ?? '')}"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Save due date</button>
            </div>
            ${taskDueDateState.taskId === task.id && taskDueDateState.error ? `<p class="alert" role="alert">${escapeHtml(taskDueDateState.error)}</p>` : ''}
          </form>
        </article>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
