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
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #1c293c; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 32px; background: white; border: 1px solid #dce2ec; border-radius: 12px; }
    h1 { margin: 0 0 24px; overflow-wrap: anywhere; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid #8a97aa; border-radius: 6px; }
    button { font: inherit; font-weight: 600; color: white; background: #2456b5; border: 0; border-radius: 6px; padding: 10px 16px; cursor: pointer; }
    button:hover { background: #1a428e; }
    :focus-visible { outline: 3px solid #dd9c17; outline-offset: 3px; }
    .create button { margin-top: 12px; }
    .projects { list-style: none; padding: 0; margin: 28px 0 0; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid #dce2ec; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #9c2020; padding: 12px; background: #fff0f0; border-radius: 6px; }
    .empty { color: #596779; margin-top: 28px; }
    .task-create, .task-filter { margin-top: 24px; }
    select { font: inherit; padding: 8px; }
    .tasks { list-style: none; padding: 0; }
    .task { padding: 16px 0; border-top: 1px solid #dce2ec; }
    .task label { display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    input[type="checkbox"] { width: 20px; height: 20px; flex-shrink: 0; }
    @media (max-width: 600px) { main { margin: 16px; padding: 20px; } .project { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create" method="post" action="/projects">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text">
      <button type="submit">Create project</button>
    </form>
    ${projects.length ? `<ul class="projects">${projects.map((project) => `
      <li class="project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${escapeHtml(project.id)}">
          <button type="submit">Open project</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

export function renderProject(project, tasks = [], filter = 'All', error = '') {
  const projectPath = `/projects/${escapeHtml(project.id)}`;
  return page(project.name, `
    <h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/">
      <button type="submit">Projects</button>
    </form>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
    <form class="create task-create" method="post" action="${projectPath}/tasks">
      <input type="hidden" name="filter" value="${escapeHtml(filter)}">
      <label for="task-title">Task title</label>
      <input id="task-title" name="title" type="text">
      <button type="submit">Create task</button>
    </form>
    <form class="task-filter" method="get" action="${projectPath}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
      <noscript><button type="submit">Apply filter</button></noscript>
    </form>
    ${tasks.length ? `<ul class="tasks">${tasks.map((task) => `
      <li class="task" data-testid="task-row">
        <form method="post" action="${projectPath}/tasks/${escapeHtml(task.id)}">
          <input type="hidden" name="filter" value="${escapeHtml(filter)}">
          <label>
            <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
          <noscript><button type="submit">Save completion</button></noscript>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No tasks to show.</p>'}
  `);
}

export function renderNotFound() {
  return page('Not found', '<h1>Page not found</h1><form method="get" action="/"><button type="submit">Projects</button></form>');
}
