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
    body { margin: 0; background: #f5f7fa; color: #172334; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 64px auto; padding: 0 24px; }
    h1 { overflow-wrap: anywhere; font-size: 36px; margin: 0 0 32px; }
    .create-form { background: white; padding: 24px; border: 1px solid #d7dfe8; border-radius: 12px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    .form-controls { display: flex; gap: 12px; }
    input { min-width: 0; flex: 1; border: 1px solid #8996a8; border-radius: 6px; padding: 10px 12px; font: inherit; }
    button { border: 1px solid #285ad1; border-radius: 6px; background: #285ad1; color: white; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #204bad; }
    :focus-visible { outline: 3px solid #ad6c00; outline-offset: 3px; }
    [role="alert"] { color: #a21b25; margin: 0 0 16px; }
    .projects { margin-top: 24px; display: grid; gap: 12px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .project-name { overflow-wrap: anywhere; min-width: 0; font-weight: 600; }
    .project-row form { flex-shrink: 0; }
    .task-create { margin-top: 24px; }
    .task-filter { margin-top: 24px; }
    select { padding: 10px 12px; font: inherit; border: 1px solid #8996a8; border-radius: 6px; background: white; }
    .task-row { background: white; border: 1px solid #d7dfe8; border-radius: 10px; padding: 18px 24px; }
    .task-row label { display: flex; align-items: center; gap: 12px; margin: 0; overflow-wrap: anywhere; }
    .task-row input { flex: none; width: 20px; height: 20px; }
    @media (max-width: 520px) { main { margin-top: 32px; } .form-controls { flex-direction: column; } .project-row { padding: 16px; } }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

export function projectListPage(projects, error = '') {
  return page('Projects', `
    <h1>Workboard</h1>
    <form class="create-form" method="post" action="/projects">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text">
        <button type="submit">Create project</button>
      </div>
    </form>
    <div class="projects">
      ${projects.map((project) => `<div class="project-row" data-testid="project-row">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <form method="get" action="/projects/${project.id}"><button type="submit">Open project</button></form>
      </div>`).join('')}
    </div>`);
}

export function projectPage(project, tasks = [], filter = 'All', error = '') {
  return page(project.name, `<h1>${escapeHtml(project.name)}</h1>
    <form method="get" action="/"><button type="submit">Projects</button></form>
    <form class="create-form task-create" method="post" action="/projects/${project.id}/tasks">
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
      <input type="hidden" name="filter" value="${filter}">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text">
        <button type="submit">Create task</button>
      </div>
    </form>
    <form class="task-filter" method="get" action="/projects/${project.id}">
      <label for="task-filter">Task filter</label>
      <select id="task-filter" name="filter" onchange="this.form.requestSubmit()">
        ${['All', 'Open', 'Completed'].map((option) => `<option${filter === option ? ' selected' : ''}>${option}</option>`).join('')}
      </select>
    </form>
    <div class="projects">
      ${tasks.map((task) => `<div class="task-row" data-testid="task-row">
        <form method="post" action="/projects/${project.id}/tasks/${task.id}">
          <input type="hidden" name="filter" value="${filter}">
          <label><input type="checkbox" name="completed" value="1" aria-label="Complete ${escapeHtml(task.title)}"${task.completed ? ' checked' : ''} onchange="this.form.requestSubmit()"><span>${escapeHtml(task.title)}</span></label>
        </form>
      </div>`).join('')}
    </div>`);
}
