function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #172438; background: #f3f5f9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 60px auto; padding: 28px; }
    h1 { font-size: 2.2rem; overflow-wrap: anywhere; }
    .panel { background: white; padding: 24px; border: 1px solid #d8deea; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .create { display: flex; gap: 12px; flex-wrap: wrap; }
    input { flex: 1; min-width: 160px; padding: 11px; border: 1px solid #8693a8; border-radius: 6px; font: inherit; }
    input[type="checkbox"] { flex: none; min-width: auto; width: 20px; height: 20px; }
    .task label { margin: 0; display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; }
    select { padding: 10px; font: inherit; margin-bottom: 12px; }
    button { padding: 11px 16px; border: 0; border-radius: 6px; background: #2357bd; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #174398; }
    :focus-visible { outline: 3px solid #a36b00; outline-offset: 3px; }
    ul { list-style: none; padding: 0; }
    .project { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 12px; }
    .project span { overflow-wrap: anywhere; min-width: 0; }
    .project form { flex-shrink: 0; }
    [role="alert"] { color: #a31c24; font-weight: 600; }
    .empty { color: #526078; }
    @media (max-width: 480px) { main { margin: 20px auto; padding: 16px; } .project { flex-wrap: wrap; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function renderProjects(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    <section class="panel" aria-label="Create a project">
      <form method="post" action="/projects">
        <label for="project-name">Project name</label>
        <div class="create">
          <input id="project-name" name="name" type="text" autocomplete="off"${error ? ' aria-invalid="true" aria-describedby="name-error"' : ''}>
          <button type="submit">Create project</button>
        </div>
        ${error ? `<p id="name-error" role="alert">${escapeHtml(error)}</p>` : ''}
      </form>
    </section>
    <h2>Projects</h2>
    ${projects.length ? `<ul>${projects.map(project => `
      <li class="panel project" data-testid="project-row">
        <span>${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}">
          <button type="submit">Open project</button>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No projects yet.</p>'}
  `);
}

export function renderProject(project, tasks = [], filter = 'All', error = '') {
  return page(project.name, `
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <section class="panel" aria-label="Create a task">
      <form method="post" action="/projects/${project.id}/tasks?filter=${filter}">
        <label for="task-title">Task title</label>
        <div class="create">
          <input id="task-title" name="title" type="text" autocomplete="off"${error ? ' aria-invalid="true" aria-describedby="task-error"' : ''}>
          <button type="submit">Create task</button>
        </div>
        ${error ? `<p id="task-error" role="alert">${escapeHtml(error)}</p>` : ''}
      </form>
    </section>
    <h2>Tasks</h2>
    <form method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map(value => `<option${filter === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select>
    </form>
    ${tasks.length ? `<ul>${tasks.map(task => `
      <li class="panel task" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}?filter=${filter}">
          <label>
            <input type="checkbox" name="completed" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()">
            <span>${escapeHtml(task.title)}</span>
          </label>
        </form>
      </li>`).join('')}</ul>` : '<p class="empty">No matching tasks.</p>'}
  `);
}
