function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function layout(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Workboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172b36; background: #f3f6f7; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    .eyebrow { color: #466774; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-size: clamp(2rem, 6vw, 3rem); margin: 12px 0; overflow-wrap: anywhere; }
    .intro { color: #526773; margin: 0 0 32px; }
    .panel { background: white; border: 1px solid #d7e1e5; border-radius: 16px; padding: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 10px; }
    .create-fields { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8b9fa9; border-radius: 8px; padding: 12px; font: inherit; }
    select { border: 1px solid #8b9fa9; border-radius: 8px; padding: 12px; font: inherit; background: white; }
    .task-filter { margin: 24px 0; }
    .task-list { display: grid; gap: 12px; }
    .task-row { padding: 18px 24px; background: white; border: 1px solid #d7e1e5; border-radius: 12px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input { flex: none; width: 20px; height: 20px; }
    .task-row span { min-width: 0; }
    button { border: 1px solid #176b69; background: #176b69; color: white; border-radius: 8px; padding: 12px 18px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #105452; }
    :focus-visible { outline: 3px solid #d39320; outline-offset: 3px; }
    h2 { margin: 32px 0 16px; font-size: 1.15rem; }
    .project-list { display: grid; gap: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 24px; background: white; border: 1px solid #d7e1e5; border-radius: 12px; }
    .project-name { font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .project-row form { flex-shrink: 0; }
    .project-row button { background: white; color: #176b69; }
    .project-row button:hover { background: #edf6f5; }
    .empty { color: #526773; }
    [role="alert"] { color: #9e2525; background: #fff0ef; padding: 12px; border-radius: 8px; }
    @media (max-width: 520px) { main { margin: 32px auto; } .create-fields, .project-row { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectsPage(projects, error = '') {
  return layout('Projects', `
    <div class="eyebrow">Your workspace</div>
    <h1>Workboard</h1>
    <p class="intro">A place for your projects.</p>
    <form class="panel" action="/" method="post">
      <label for="project-name">Project name</label>
      ${error ? `<p role="alert" id="name-error">${escapeHtml(error)}</p>` : ''}
      <div class="create-fields">
        <input id="project-name" name="name" type="text" ${error ? 'aria-invalid="true" aria-describedby="name-error"' : ''}>
        <button type="submit">Create project</button>
      </div>
    </form>
    <h2>Projects</h2>
    <div class="project-list">
      ${projects.map((project) => `
        <div class="project-row" data-testid="project-row">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <form action="/projects/${project.id}" method="get"><button type="submit">Open project</button></form>
        </div>`).join('')}
    </div>
    ${projects.length ? '' : '<p class="empty">No projects yet. Create your first project above.</p>'}`);
}

export function projectPage(project, tasks, filter = 'All', error = '') {
  return layout(project.name, `
    <form action="/" method="get"><button type="submit">Projects</button></form>
    <h1>${escapeHtml(project.name)}</h1>
    <form class="panel" action="/projects/${project.id}/tasks" method="post">
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      ${error ? `<p role="alert" id="title-error">${escapeHtml(error)}</p>` : ''}
      <div class="create-fields">
        <input id="task-title" name="title" type="text" ${error ? 'aria-invalid="true" aria-describedby="title-error"' : ''}>
        <button type="submit">Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form class="task-filter" action="/projects/${project.id}" method="get">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" data-submit-on-change>
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="task-list">
      ${tasks.map((task) => `
        <div class="task-row" data-testid="task-row">
          <form action="/projects/${project.id}/tasks/${task.id}" method="post">
            <input type="hidden" name="filter" value="${filter}">
            <label>
              <input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''} data-submit-on-change>
              <span>${escapeHtml(task.title)}</span>
            </label>
          </form>
        </div>`).join('')}
    </div>
    ${tasks.length ? '' : '<p class="empty">No tasks match this filter.</p>'}
    <script>
      document.querySelectorAll('[data-submit-on-change]').forEach((control) => {
        control.addEventListener('change', () => control.form.requestSubmit());
      });
    </script>`);
}

export function errorPage(message) {
  return layout(message, `<h1>${escapeHtml(message)}</h1>
    <form action="/" method="get"><button type="submit">Projects</button></form>`);
}
