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
    :root { font-family: system-ui, sans-serif; color: #192b3b; background: #f3f6fa; }
    body { margin: 0; }
    main { max-width: 720px; margin: 3rem auto; padding: 2rem; background: white; border-radius: 12px; }
    h1 { margin-top: 0; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: .5rem; }
    input { box-sizing: border-box; width: 100%; padding: .75rem; border: 1px solid #65788a; border-radius: 5px; font: inherit; }
    button { border: 0; border-radius: 5px; padding: .7rem 1rem; background: #245bc2; color: white; font: inherit; cursor: pointer; }
    button:hover { background: #194597; }
    button:disabled { background: #65788a; cursor: not-allowed; }
    select { font: inherit; padding: .5rem; }
    .task-filter { margin-top: 1.5rem; }
    .task { display: flex; align-items: center; gap: .75rem; border-top: 1px solid #d6dee7; padding: 1rem 0; overflow-wrap: anywhere; }
    .task input { width: auto; }
    .task form { display: flex; align-items: center; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #dd9800; outline-offset: 3px; }
    .create button { margin-top: .75rem; }
    .projects { margin-top: 2rem; }
    .project { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-top: 1px solid #d6dee7; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a01717; margin: 1rem 0; }
    @media (max-width: 600px) { main { margin: 1rem; padding: 1.25rem; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '', filter = 'active') {
  return page('Projects', `<h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    <form class="task-filter" action="/" method="get">
      <label for="project-filter">Project filter</label>
      <select id="project-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['active', 'Active'], ['archived', 'Archived']].map(([value, label]) => `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section class="projects" aria-label="Projects">
      ${projects.map((project) => `<div class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <span data-testid="project-summary">${project.completed}/${project.total} completed</span>
        <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        <form action="/projects/${project.id}/${project.archived ? 'restore' : 'archive'}" method="post"><button type="submit">${project.archived ? 'Restore project' : 'Archive project'}</button></form>
      </div>`).join('')}
    </section>`);
}

export function renderProject(project, tasks = [], filter = 'all', error = '') {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>
    ${project.archived ? '<p>Archived project</p>' : ''}
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit"${project.archived ? ' disabled' : ''}>Create task</button>
    </form>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([value, label]) => `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </form>
    <section aria-label="Tasks">
      ${tasks.map((task) => `<div class="task" data-testid="task-row">
        <form action="/projects/${project.id}/tasks/${task.id}" method="post">
          <input type="hidden" name="filter" value="${filter}">
          <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''}${project.archived ? ' disabled' : ''} onchange="this.form.requestSubmit()">
        </form>
        <span>${escapeHtml(task.title)}</span>
      </div>`).join('')}
    </section>`);
}

export function renderNotFound() {
  return page('Not found', '<h1>Page not found</h1><form action="/" method="get"><button type="submit">Projects</button></form>');
}
