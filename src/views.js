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

export function projectPage(project, tasks = [], filter = 'All', error = '', submittedTitle = '', renameState = {}, taskRenameState = {}) {
  return page(project.name, `
    <form action="/" method="get"><button class="secondary" type="submit">Projects</button></form>
    <p class="eyebrow detail-label">PROJECT</p>
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form class="create-form rename-form" action="/projects/${project.id}/rename" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" value="${escapeHtml(renameState.submittedName ?? project.name)}"${project.archived ? ' disabled' : ''}>
        <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
      </div>
      ${renameState.error ? `<p class="alert" role="alert">${escapeHtml(renameState.error)}</p>` : ''}
    </form>
    <form class="create-form" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" value="${escapeHtml(submittedTitle)}">
        <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
      </div>
      ${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-submit-on-change>
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    <section aria-label="Tasks">
      ${tasks.length ? tasks.map((task) => `
        <article class="task-row" data-testid="task-row">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <form action="/projects/${project.id}/tasks/${task.id}/completion" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} data-submit-on-change>
            <noscript><button type="submit"${project.archived ? ' disabled' : ''}>Save completion</button></noscript>
          </form>
          <form class="task-rename-form" action="/projects/${project.id}/tasks/${task.id}/rename" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <label for="new-task-title-${task.id}">New task title</label>
            <div class="form-controls">
              <input id="new-task-title-${task.id}" name="title" type="text" value="${escapeHtml(taskRenameState.taskId === task.id ? taskRenameState.submittedTitle : task.title)}"${project.archived ? ' disabled' : ''}>
              <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
            </div>
            ${taskRenameState.taskId === task.id && taskRenameState.error ? `<p class="alert" role="alert">${escapeHtml(taskRenameState.error)}</p>` : ''}
          </form>
        </article>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
