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

export function projectsPage(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form action="/projects" method="post" class="create-project">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <section aria-label="Projects" class="project-list">
      ${projects.length ? projects.map((project) => `
        <div data-testid="project-row" class="project-row">
          <span>${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get">
            <button type="submit">Open project</button>
          </form>
        </div>`).join('') : '<p class="empty">Your projects will appear here.</p>'}
    </section>`);
}

export function projectPage(project, tasks = [], filter = 'All', error = '') {
  const projectPath = `/projects/${project.id}`;
  return page(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <form action="${projectPath}/tasks" method="post">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form action="${projectPath}" method="get" class="task-filter" data-auto-submit>
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter">
        ${['All', 'Open', 'Completed'].map((option) =>
          `<option${option === filter ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks" class="task-list">
      ${tasks.length ? tasks.map((task) => `
        <div data-testid="task-row" class="task-row">
          <span>${escapeHtml(task.title)}</span>
          <form action="${projectPath}/tasks/${task.id}/completion" method="post" data-auto-submit>
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}>
          </form>
        </div>`).join('') : '<p class="empty">No tasks match this filter.</p>'}
    </section>`);
}

export function notFoundPage() {
  return page('Page not found', '<h1>Page not found</h1><a href="/">Projects</a>');
}
