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

export function projectsPage(projects, error = '', filter = 'active') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form method="post" action="/projects" class="create-form">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="get" action="/" class="project-filter" data-submit-on-change>
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter">
        ${[['active', 'Active'], ['archived', 'Archived']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Projects" class="projects">
      ${projects.length ? projects.map((project) => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <span data-testid="project-summary">${project.completed_count}/${project.total_count} completed</span>
          <form method="get" action="/projects/${project.id}">
            <button type="submit">Open project</button>
          </form>
          <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
            <input type="hidden" name="filter" value="${filter}">
            <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
          </form>
        </div>`).join('') : '<p class="empty">No projects yet.</p>'}
    </section>`);
}

export function projectPage(project, tasks, filter = 'all', error = '', priorityFilter = 'all') {
  const filterFields = `<input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="priorityFilter" value="${priorityFilter}">`;
  return page(project.name, `
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="post" action="/projects/${project.id}/rename" class="create-form">
      ${filterFields}
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
    </form>
    <form method="post" action="/projects/${project.id}/default-priority" class="create-form" data-submit-on-change>
      ${filterFields}
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" name="priority"${project.archived ? ' disabled' : ''}>
        ${[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']].map(([value, label]) =>
          `<option value="${value}"${project.default_task_priority === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <form method="post" action="/projects/${project.id}/tasks" class="create-form">
      ${filterFields}
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="get" action="/projects/${project.id}" class="task-filter" data-submit-on-change>
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter" name="priorityFilter">
        ${[['all', 'All'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'High']].map(([value, label]) =>
          `<option value="${value}"${priorityFilter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks" class="tasks">
      ${tasks.length ? tasks.map((task) => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion" data-submit-on-change>
            ${filterFields}
            <input type="checkbox" name="completed" value="true" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''}>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/priority" data-submit-on-change>
            ${filterFields}
            <label for="task-priority-${task.id}">Task priority</label>
            <select id="task-priority-${task.id}" name="priority"${project.archived ? ' disabled' : ''}>
              ${[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']].map(([value, label]) =>
                `<option value="${value}"${task.priority === value ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </form>
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/rename" class="task-rename">
            ${filterFields}
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="form-controls">
              <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
          </form>
        </div>`).join('') : '<p class="empty">No matching tasks.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
