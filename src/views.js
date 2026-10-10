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

export function projectsPage(projects, error = '', submittedName = '') {
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
    <section aria-label="Projects" class="project-list">
      ${projects.length ? projects.map((project) => `
        <article class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button class="secondary" type="submit">Open project</button>
          </form>
        </article>`).join('') : '<p class="empty">No projects yet. Create a project to get started.</p>'}
    </section>`);
}

export function projectPage(project, tasks = [], filter = 'All', error = '', submittedTitle = '') {
  return page(project.name, `
    <form action="/" method="get"><button class="secondary" type="submit">Projects</button></form>
    <p class="eyebrow detail-label">PROJECT</p>
    <h1>${escapeHtml(project.name)}</h1>
    <form class="create-form" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" value="${escapeHtml(submittedTitle)}">
        <button type="submit">Create task</button>
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
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} data-submit-on-change>
            <noscript><button type="submit">Save completion</button></noscript>
          </form>
        </article>`).join('') : '<p class="empty">No tasks to show.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
