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
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #192537; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: 64px auto; padding: 28px; background: white; border: 1px solid #dde3eb; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 11px; font: inherit; border: 1px solid #66768a; border-radius: 5px; }
    button { padding: 10px 16px; border: 0; border-radius: 5px; background: #2456bd; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #194493; }
    button:disabled { background: #66768a; cursor: default; }
    :focus-visible { outline: 3px solid #9c6200; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { margin-top: 28px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 1px solid #dde3eb; padding: 16px 0; }
    .project-row span { overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    select { padding: 10px; font: inherit; }
    .task-filter, .project-filter { margin-top: 28px; }
    .task-row { border-top: 1px solid #dde3eb; padding: 16px 0; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    .task-row .create { margin-top: 16px; }
    .task-row .create label { margin-bottom: 8px; }
    [role="alert"] { color: #9c2020; }
    @media (max-width: 760px) { main { margin: 24px 12px; padding: 20px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '', filter = 'active') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="project-filter" method="get" action="/">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['active', 'Active'], ['archived', 'Archived']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <div>
            <span>${escapeHtml(project.name)}</span>
            <div data-testid="project-summary">${project.completed_count}/${project.total_count} completed</div>
          </div>
          <div class="project-actions">
            <form method="get" action="/projects/${project.id}">
              <button type="submit">Open project</button>
            </form>
            <form method="post" action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}">
              <button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button>
            </form>
          </div>
        </div>`).join('')}
    </section>`);
}

export function projectPage(project, tasks = [], filter = 'all', error = '') {
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form method="get" action="/"><button type="submit">Projects</button></form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects/${project.id}/rename">
      <input type="hidden" name="filter" value="${filter}">
      <label for="new-project-name">New project name</label>
      <input id="new-project-name" name="name" type="text"${project.archived ? ' disabled' : ''}>
      <button type="submit"${project.archived ? ' disabled' : ''}>Rename project</button>
    </form>
    <form class="create" method="post" action="/projects/${project.id}/tasks">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) =>
          `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map((task) => `
        <div class="task-row" data-testid="task-row">
          <form method="post" action="/projects/${project.id}/tasks/${task.id}/completion">
            <input type="hidden" name="filter" value="${filter}">
            <label>
              <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
          <form class="create" method="post" action="/projects/${project.id}/tasks/${task.id}/rename">
            <input type="hidden" name="filter" value="${filter}">
            <label for="new-task-title-${task.id}">New task title</label>
            <input id="new-task-title-${task.id}" name="title" type="text"${project.archived ? ' disabled' : ''}>
            <button type="submit"${project.archived ? ' disabled' : ''}>Rename task</button>
          </form>
        </div>`).join('')}
    </section>`);
}

export function notFoundPage() {
  return page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>');
}
